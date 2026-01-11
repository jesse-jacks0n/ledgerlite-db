/**
 * LedgerLite - Database Storage
 * 
 * Main database class that manages multiple tables and provides
 * persistence capabilities.
 * 
 * Design decisions:
 * - Tables are stored in a Map for O(1) lookup by name
 * - Persistence uses JSON serialization to disk
 * - Database can be saved/loaded to support optional persistence
 */

import * as fs from 'fs';
import * as path from 'path';
import { Table } from './Table';
import { TableSchema, SerializedDatabase } from '../types';

const DATABASE_VERSION = '1.0.0';

export class Database {
    private tables: Map<string, Table>;
    private name: string;
    private persistPath?: string;

    constructor(name: string = 'ledgerlite') {
        this.name = name;
        this.tables = new Map();
    }

    /**
     * Get the database name.
     */
    getName(): string {
        return this.name;
    }

    /**
     * Create a new table.
     */
    createTable(schema: TableSchema): Table {
        const tableName = schema.tableName.toLowerCase();

        if (this.tables.has(tableName)) {
            throw new Error(`Table '${schema.tableName}' already exists`);
        }

        // Validate schema
        if (schema.columns.length === 0) {
            throw new Error('Table must have at least one column');
        }

        // Check for duplicate column names
        const columnNames = new Set<string>();
        for (const column of schema.columns) {
            const lowerName = column.name.toLowerCase();
            if (columnNames.has(lowerName)) {
                throw new Error(`Duplicate column name: '${column.name}'`);
            }
            columnNames.add(lowerName);
        }

        // Find and validate primary key
        const pkColumns = schema.columns.filter(c =>
            c.constraints.includes('PRIMARY_KEY')
        );

        if (pkColumns.length > 1) {
            throw new Error('Only single-column PRIMARY KEY is supported');
        }

        if (pkColumns.length === 1) {
            schema.primaryKey = pkColumns[0].name;
        }

        const table = new Table(schema);
        this.tables.set(tableName, table);

        return table;
    }

    /**
     * Get a table by name.
     */
    getTable(name: string): Table | undefined {
        return this.tables.get(name.toLowerCase());
    }

    /**
     * Check if a table exists.
     */
    hasTable(name: string): boolean {
        return this.tables.has(name.toLowerCase());
    }

    /**
     * Get all table names.
     */
    getTableNames(): string[] {
        return Array.from(this.tables.keys());
    }

    /**
     * Drop a table.
     */
    dropTable(name: string): boolean {
        return this.tables.delete(name.toLowerCase());
    }

    /**
     * Clear all tables.
     */
    clear(): void {
        this.tables.clear();
    }

    /**
     * Set the persistence path for the database.
     */
    setPersistPath(filePath: string): void {
        this.persistPath = filePath;
    }

    /**
     * Save the database to disk.
     */
    save(filePath?: string): void {
        const savePath = filePath || this.persistPath;
        if (!savePath) {
            throw new Error('No persistence path specified');
        }

        const serialized: SerializedDatabase = {
            version: DATABASE_VERSION,
            tables: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        for (const [name, table] of this.tables) {
            serialized.tables[name] = table.serialize();
        }

        const dir = path.dirname(savePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(savePath, JSON.stringify(serialized, null, 2));
    }

    /**
     * Load the database from disk.
     */
    load(filePath?: string): void {
        const loadPath = filePath || this.persistPath;
        if (!loadPath) {
            throw new Error('No persistence path specified');
        }

        if (!fs.existsSync(loadPath)) {
            throw new Error(`Database file not found: ${loadPath}`);
        }

        const content = fs.readFileSync(loadPath, 'utf-8');
        const serialized: SerializedDatabase = JSON.parse(content);

        // Version check
        if (serialized.version !== DATABASE_VERSION) {
            console.warn(
                `Warning: Database version mismatch. File: ${serialized.version}, Current: ${DATABASE_VERSION}`
            );
        }

        this.tables.clear();
        for (const [name, tableData] of Object.entries(serialized.tables)) {
            this.tables.set(name, Table.deserialize(tableData));
        }
    }

    /**
     * Check if a persistence file exists.
     */
    persistenceFileExists(filePath?: string): boolean {
        const checkPath = filePath || this.persistPath;
        return checkPath ? fs.existsSync(checkPath) : false;
    }

    /**
     * Get database statistics.
     */
    getStats(): { tableCount: number; tables: Record<string, number> } {
        const tables: Record<string, number> = {};
        for (const [name, table] of this.tables) {
            tables[name] = table.count();
        }
        return {
            tableCount: this.tables.size,
            tables,
        };
    }
}
