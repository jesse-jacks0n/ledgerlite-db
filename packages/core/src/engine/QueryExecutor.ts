/**
 * LedgerLite - Query Executor
 * 
 * Executes parsed SQL statements against the database.
 * 
 * Design decisions:
 * - Separates parsing from execution (clean architecture)
 * - Returns structured results for easy consumption
 * - Uses indexes automatically when WHERE targets a PRIMARY KEY
 * - Provides clear error messages
 */

import { Database } from '../storage/Database';
import { Table } from '../storage/Table';
import { Parser } from '../parser/Parser';
import { innerJoin } from '../join/JoinEngine';
import {
    ParsedStatement,
    ExecutionResult,
    QueryResult,
    Row,
    WhereCondition,
    Value,
} from '../types';

export class QueryExecutor {
    private database: Database;

    constructor(database: Database) {
        this.database = database;
    }

    /**
     * Execute a SQL query string.
     */
    execute(sql: string): ExecutionResult {
        try {
            const parser = new Parser(sql);
            const statement = parser.parse();
            return this.executeStatement(statement);
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Execute a parsed statement.
     */
    executeStatement(statement: ParsedStatement): ExecutionResult {
        try {
            switch (statement.type) {
                case 'CREATE_TABLE':
                    return this.executeCreateTable(statement);
                case 'INSERT':
                    return this.executeInsert(statement);
                case 'SELECT':
                    return this.executeSelect(statement);
                case 'UPDATE':
                    return this.executeUpdate(statement);
                case 'DELETE':
                    return this.executeDelete(statement);
                case 'SHOW_TABLES':
                    return this.executeShowTables();
                case 'DESCRIBE':
                    return this.executeDescribe(statement);
                default:
                    return {
                        success: false,
                        error: `Unknown statement type`,
                    };
            }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * Execute CREATE TABLE.
     */
    private executeCreateTable(statement: ParsedStatement & { type: 'CREATE_TABLE' }): ExecutionResult {
        const schema = {
            tableName: statement.tableName,
            columns: statement.columns,
        };

        this.database.createTable(schema);

        return {
            success: true,
            message: `Table '${statement.tableName}' created successfully`,
        };
    }

    /**
     * Execute INSERT.
     */
    private executeInsert(statement: ParsedStatement & { type: 'INSERT' }): ExecutionResult {
        const table = this.getTable(statement.tableName);
        const rowId = table.insert(statement.columns, statement.values);

        return {
            success: true,
            message: `1 row inserted (id: ${rowId})`,
            rowCount: 1,
        };
    }

    /**
     * Execute SELECT.
     */
    private executeSelect(statement: ParsedStatement & { type: 'SELECT' }): ExecutionResult {
        const table = this.getTable(statement.tableName);

        // Handle JOIN
        if (statement.join) {
            const rightTable = this.getTable(statement.join.table);
            const joinResult = innerJoin(
                table,
                rightTable,
                statement.join,
                statement.columns
            );

            let rows = joinResult.rows;

            // Apply WHERE filter if present
            if (statement.where) {
                const predicate = this.createPredicate(statement.where);
                rows = rows.filter(predicate);
            }

            return {
                success: true,
                rows,
                rowCount: rows.length,
                columns: joinResult.columns,
            };
        }

        // Simple SELECT (no JOIN)
        let rows: Row[];
        const columns = statement.columns;

        // Check if we can use an index
        if (statement.where && this.canUseIndex(table, statement.where)) {
            rows = this.selectWithIndex(table, columns, statement.where);
        } else {
            const predicate = statement.where
                ? this.createPredicate(statement.where)
                : undefined;
            rows = table.select(columns, predicate);
        }

        // Determine actual column names for response
        const resultColumns = columns === '*'
            ? table.getColumns().map(c => c.name)
            : columns;

        return {
            success: true,
            rows,
            rowCount: rows.length,
            columns: resultColumns,
        };
    }

    /**
     * Execute UPDATE.
     */
    private executeUpdate(statement: ParsedStatement & { type: 'UPDATE' }): ExecutionResult {
        const table = this.getTable(statement.tableName);

        const predicate = statement.where
            ? this.createPredicate(statement.where)
            : undefined;

        const updatedCount = table.update(statement.set, predicate);

        return {
            success: true,
            message: `${updatedCount} row(s) updated`,
            rowCount: updatedCount,
        };
    }

    /**
     * Execute DELETE.
     */
    private executeDelete(statement: ParsedStatement & { type: 'DELETE' }): ExecutionResult {
        const table = this.getTable(statement.tableName);

        const predicate = statement.where
            ? this.createPredicate(statement.where)
            : undefined;

        const deletedCount = table.delete(predicate);

        return {
            success: true,
            message: `${deletedCount} row(s) deleted`,
            rowCount: deletedCount,
        };
    }

    /**
     * Execute SHOW TABLES.
     */
    private executeShowTables(): ExecutionResult {
        const tableNames = this.database.getTableNames();
        const rows = tableNames.map(name => ({ table_name: name }));

        return {
            success: true,
            rows,
            rowCount: rows.length,
            columns: ['table_name'],
        };
    }

    /**
     * Execute DESCRIBE.
     */
    private executeDescribe(statement: ParsedStatement & { type: 'DESCRIBE' }): ExecutionResult {
        const table = this.getTable(statement.tableName);
        const columns = table.getColumns();

        const rows = columns.map(col => ({
            column_name: col.name,
            data_type: col.type,
            constraints: col.constraints.join(', ') || 'NONE',
        }));

        return {
            success: true,
            rows,
            rowCount: rows.length,
            columns: ['column_name', 'data_type', 'constraints'],
        };
    }

    // ==========================================================================
    // HELPER METHODS
    // ==========================================================================

    /**
     * Get a table or throw an error.
     */
    private getTable(name: string): Table {
        const table = this.database.getTable(name);
        if (!table) {
            throw new Error(`Table '${name}' does not exist`);
        }
        return table;
    }

    /**
     * Create a predicate function from a WHERE condition.
     */
    private createPredicate(where: WhereCondition): (row: Row) => boolean {
        const { column, value } = where;

        // Handle table.column format
        const colName = column.includes('.') ? column.split('.')[1] : column;

        return (row: Row): boolean => {
            const rowValue = row[colName] ?? row[column];
            return this.valuesEqual(rowValue, value);
        };
    }

    /**
     * Compare two values for equality.
     */
    private valuesEqual(a: Value, b: Value): boolean {
        if (a === null || b === null) {
            return a === b;
        }
        return a === b;
    }

    /**
     * Check if we can use an index for a WHERE clause.
     */
    private canUseIndex(table: Table, where: WhereCondition): boolean {
        const colName = where.column.includes('.')
            ? where.column.split('.')[1]
            : where.column;

        return table.isPrimaryKey(colName) || table.getIndex(colName) !== undefined;
    }

    /**
     * Select rows using an index.
     */
    private selectWithIndex(
        table: Table,
        columns: string[] | '*',
        where: WhereCondition
    ): Row[] {
        const colName = where.column.includes('.')
            ? where.column.split('.')[1]
            : where.column;

        const index = table.getIndex(colName);
        if (!index) {
            // Fallback to full scan
            return table.select(columns, this.createPredicate(where));
        }

        const rowIds = index.lookup(where.value);
        return table.selectByRowIds(rowIds, columns);
    }
}
