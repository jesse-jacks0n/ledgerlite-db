/**
 * LedgerLite - Table Storage
 * 
 * Implements in-memory row-based storage for a single table.
 * Each table maintains its schema, rows, and indexes.
 * 
 * Design decisions:
 * - Rows are stored in an array with internal row IDs for stable references
 * - Deleted rows leave gaps (tombstones) - simple but wastes memory
 * - Indexes are maintained automatically on all write operations
 * - Constraint validation happens before any modifications
 */

import {
    TableSchema,
    ColumnDefinition,
    Row,
    InternalRow,
    Value,
    DataType,
    SerializedTable,
    TableIndex,
} from '../types';
import { HashIndex } from '../index/HashIndex';

export class Table {
    private schema: TableSchema;
    private rows: Map<number, InternalRow>;
    private nextRowId: number;
    private indexes: Map<string, HashIndex>;

    constructor(schema: TableSchema) {
        this.schema = schema;
        this.rows = new Map();
        this.nextRowId = 1;
        this.indexes = new Map();

        // Create indexes for PRIMARY KEY and UNIQUE columns
        this.initializeIndexes();
    }

    /**
     * Initialize hash indexes for constrained columns.
     */
    private initializeIndexes(): void {
        for (const column of this.schema.columns) {
            if (column.constraints.includes('PRIMARY_KEY') || column.constraints.includes('UNIQUE')) {
                const index = new HashIndex(column.name, true);
                this.indexes.set(column.name, index);
            }
        }
    }

    /**
     * Get the table schema.
     */
    getSchema(): TableSchema {
        return this.schema;
    }

    /**
     * Get the table name.
     */
    getName(): string {
        return this.schema.tableName;
    }

    /**
     * Get column definitions.
     */
    getColumns(): ColumnDefinition[] {
        return this.schema.columns;
    }

    /**
     * Get a column definition by name.
     */
    getColumn(name: string): ColumnDefinition | undefined {
        return this.schema.columns.find(col => col.name.toLowerCase() === name.toLowerCase());
    }

    /**
     * Check if a column exists.
     */
    hasColumn(name: string): boolean {
        return this.getColumn(name) !== undefined;
    }

    /**
     * Validate a value against a column's data type.
     */
    private validateType(value: Value, expectedType: DataType): boolean {
        if (value === null) {
            return true; // NULL is allowed for all types (no NOT NULL constraint in spec)
        }

        switch (expectedType) {
            case 'INT':
                return typeof value === 'number' && Number.isInteger(value);
            case 'TEXT':
                return typeof value === 'string';
            case 'BOOL':
                return typeof value === 'boolean';
            default:
                return false;
        }
    }

    /**
     * Validate constraints before insert/update.
     */
    private validateConstraints(row: Row, excludeRowId?: number): void {
        for (const column of this.schema.columns) {
            const value = row[column.name];

            // Check PRIMARY KEY not null
            if (column.constraints.includes('PRIMARY_KEY') && (value === null || value === undefined)) {
                throw new Error(`PRIMARY KEY column '${column.name}' cannot be NULL`);
            }

            // Check UNIQUE constraint
            if (column.constraints.includes('UNIQUE') || column.constraints.includes('PRIMARY_KEY')) {
                const index = this.indexes.get(column.name);
                if (index && value !== null && value !== undefined) {
                    const existingRowIds = index.lookup(value);
                    for (const existingRowId of existingRowIds) {
                        if (existingRowId !== excludeRowId) {
                            throw new Error(
                                `UNIQUE constraint violation: value '${value}' already exists in column '${column.name}'`
                            );
                        }
                    }
                }
            }
        }
    }

    /**
     * Insert a new row into the table.
     */
    insert(columns: string[], values: Value[]): number {
        if (columns.length !== values.length) {
            throw new Error('Column count does not match value count');
        }

        // Build the row object
        const row: Row = {};

        for (let i = 0; i < columns.length; i++) {
            const colName = columns[i];
            const value = values[i];

            const column = this.getColumn(colName);
            if (!column) {
                throw new Error(`Unknown column: '${colName}'`);
            }

            if (!this.validateType(value, column.type)) {
                throw new Error(
                    `Type mismatch: column '${colName}' expects ${column.type}, got ${typeof value}`
                );
            }

            row[column.name] = value;
        }

        // Fill in missing columns with null
        for (const column of this.schema.columns) {
            if (!(column.name in row)) {
                row[column.name] = null;
            }
        }

        // Validate constraints
        this.validateConstraints(row);

        // Create internal row
        const rowId = this.nextRowId++;
        const internalRow: InternalRow = {
            _rowId: rowId,
            data: row,
        };

        // Add to storage
        this.rows.set(rowId, internalRow);

        // Update indexes
        for (const [colName, index] of this.indexes) {
            const value = row[colName];
            if (value !== null && value !== undefined) {
                index.add(value, rowId);
            }
        }

        return rowId;
    }

    /**
     * Select rows from the table.
     * @param columns - Columns to select, or '*' for all
     * @param predicate - Optional filter function
     */
    select(
        columns: string[] | '*',
        predicate?: (row: Row) => boolean
    ): Row[] {
        const results: Row[] = [];
        const selectCols = columns === '*'
            ? this.schema.columns.map(c => c.name)
            : columns;

        // Validate column names
        for (const col of selectCols) {
            // Handle table.column format
            const colName = col.includes('.') ? col.split('.')[1] : col;
            if (!this.hasColumn(colName)) {
                throw new Error(`Unknown column: '${col}'`);
            }
        }

        for (const [, internalRow] of this.rows) {
            if (!predicate || predicate(internalRow.data)) {
                const resultRow: Row = {};
                for (const col of selectCols) {
                    const colName = col.includes('.') ? col.split('.')[1] : col;
                    resultRow[col] = internalRow.data[colName];
                }
                results.push(resultRow);
            }
        }

        return results;
    }

    /**
     * Select rows by row IDs (used for index lookups).
     */
    selectByRowIds(rowIds: Set<number>, columns: string[] | '*'): Row[] {
        const results: Row[] = [];
        const selectCols = columns === '*'
            ? this.schema.columns.map(c => c.name)
            : columns;

        for (const rowId of rowIds) {
            const internalRow = this.rows.get(rowId);
            if (internalRow) {
                const resultRow: Row = {};
                for (const col of selectCols) {
                    const colName = col.includes('.') ? col.split('.')[1] : col;
                    resultRow[col] = internalRow.data[colName];
                }
                results.push(resultRow);
            }
        }

        return results;
    }

    /**
     * Get all rows (internal representation).
     */
    getAllRows(): InternalRow[] {
        return Array.from(this.rows.values());
    }

    /**
     * Get a row by its internal row ID.
     */
    getRowById(rowId: number): InternalRow | undefined {
        return this.rows.get(rowId);
    }

    /**
     * Update rows matching a predicate.
     */
    update(
        updates: Record<string, Value>,
        predicate?: (row: Row) => boolean
    ): number {
        let updatedCount = 0;

        // Validate update columns and types
        for (const [colName, value] of Object.entries(updates)) {
            const column = this.getColumn(colName);
            if (!column) {
                throw new Error(`Unknown column: '${colName}'`);
            }
            if (!this.validateType(value, column.type)) {
                throw new Error(
                    `Type mismatch: column '${colName}' expects ${column.type}, got ${typeof value}`
                );
            }
        }

        // Find rows to update
        const rowsToUpdate: InternalRow[] = [];
        for (const [, internalRow] of this.rows) {
            if (!predicate || predicate(internalRow.data)) {
                rowsToUpdate.push(internalRow);
            }
        }

        // Validate constraints for each update
        for (const internalRow of rowsToUpdate) {
            const newData = { ...internalRow.data, ...updates };
            this.validateConstraints(newData, internalRow._rowId);
        }

        // Apply updates
        for (const internalRow of rowsToUpdate) {
            // Update indexes - remove old values
            for (const [colName, index] of this.indexes) {
                if (colName in updates) {
                    const oldValue = internalRow.data[colName];
                    if (oldValue !== null && oldValue !== undefined) {
                        index.remove(oldValue, internalRow._rowId);
                    }
                }
            }

            // Apply updates to row
            Object.assign(internalRow.data, updates);

            // Update indexes - add new values
            for (const [colName, index] of this.indexes) {
                if (colName in updates) {
                    const newValue = internalRow.data[colName];
                    if (newValue !== null && newValue !== undefined) {
                        index.add(newValue, internalRow._rowId);
                    }
                }
            }

            updatedCount++;
        }

        return updatedCount;
    }

    /**
     * Delete rows matching a predicate.
     */
    delete(predicate?: (row: Row) => boolean): number {
        let deletedCount = 0;

        const rowIdsToDelete: number[] = [];
        for (const [rowId, internalRow] of this.rows) {
            if (!predicate || predicate(internalRow.data)) {
                rowIdsToDelete.push(rowId);
            }
        }

        for (const rowId of rowIdsToDelete) {
            const internalRow = this.rows.get(rowId);
            if (internalRow) {
                // Update indexes
                for (const [colName, index] of this.indexes) {
                    const value = internalRow.data[colName];
                    if (value !== null && value !== undefined) {
                        index.remove(value, rowId);
                    }
                }

                this.rows.delete(rowId);
                deletedCount++;
            }
        }

        return deletedCount;
    }

    /**
     * Get the total number of rows.
     */
    count(): number {
        return this.rows.size;
    }

    /**
     * Get index for a column if it exists.
     */
    getIndex(columnName: string): HashIndex | undefined {
        return this.indexes.get(columnName);
    }

    /**
     * Check if a column is the primary key.
     */
    isPrimaryKey(columnName: string): boolean {
        const column = this.getColumn(columnName);
        return column?.constraints.includes('PRIMARY_KEY') ?? false;
    }

    /**
     * Serialize the table for persistence.
     */
    serialize(): SerializedTable {
        return {
            schema: this.schema,
            rows: Array.from(this.rows.values()),
            nextRowId: this.nextRowId,
        };
    }

    /**
     * Restore a table from serialized data.
     */
    static deserialize(data: SerializedTable): Table {
        const table = new Table(data.schema);
        table.nextRowId = data.nextRowId;

        for (const row of data.rows) {
            table.rows.set(row._rowId, row);

            // Rebuild indexes
            for (const [colName, index] of table.indexes) {
                const value = row.data[colName];
                if (value !== null && value !== undefined) {
                    index.add(value, row._rowId);
                }
            }
        }

        return table;
    }
}
