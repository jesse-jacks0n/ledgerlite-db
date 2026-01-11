/**
 * LedgerLite - Core Type Definitions
 * 
 * This module defines all the fundamental types used throughout the LedgerLite RDBMS.
 * These types provide a clear contract for data representation, schema definition,
 * and query operations.
 */

// =============================================================================
// DATA TYPES
// =============================================================================

/**
 * Supported column data types in LedgerLite.
 * Keeping types minimal as per project requirements:
 * - INT: Integer numbers
 * - TEXT: String values
 * - BOOL: Boolean true/false
 */
export type DataType = 'INT' | 'TEXT' | 'BOOL';

/**
 * JavaScript representation of LedgerLite values.
 * Maps DataType to actual runtime types.
 */
export type Value = number | string | boolean | null;

/**
 * A single row of data, mapping column names to their values.
 */
export type Row = Record<string, Value>;

/**
 * Internal row representation with metadata.
 * The _rowId is used internally for indexing and updates.
 */
export interface InternalRow {
    _rowId: number;
    data: Row;
}

// =============================================================================
// SCHEMA DEFINITIONS
// =============================================================================

/**
 * Column constraint types.
 * PRIMARY_KEY: Unique identifier for rows, automatically indexed
 * UNIQUE: Values must be unique across all rows
 */
export type ConstraintType = 'PRIMARY_KEY' | 'UNIQUE';

/**
 * Defines a single column in a table schema.
 */
export interface ColumnDefinition {
    name: string;
    type: DataType;
    constraints: ConstraintType[];
}

/**
 * Complete table schema definition.
 */
export interface TableSchema {
    tableName: string;
    columns: ColumnDefinition[];
    primaryKey?: string; // Column name of the primary key
}

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Supported SQL statement types.
 */
export type StatementType =
    | 'CREATE_TABLE'
    | 'INSERT'
    | 'SELECT'
    | 'UPDATE'
    | 'DELETE'
    | 'SHOW_TABLES'
    | 'DESCRIBE';

/**
 * WHERE clause condition.
 * Currently only supports equality comparisons (column = value).
 */
export interface WhereCondition {
    column: string;
    operator: '=';
    value: Value;
}

/**
 * JOIN clause specification.
 * Only INNER JOIN with equality condition is supported.
 */
export interface JoinClause {
    type: 'INNER';
    table: string;
    leftColumn: string;  // e.g., "orders.user_id"
    rightColumn: string; // e.g., "users.id"
}

/**
 * Parsed CREATE TABLE statement.
 */
export interface CreateTableStatement {
    type: 'CREATE_TABLE';
    tableName: string;
    columns: ColumnDefinition[];
}

/**
 * Parsed INSERT statement.
 */
export interface InsertStatement {
    type: 'INSERT';
    tableName: string;
    columns: string[];
    values: Value[];
}

/**
 * Parsed SELECT statement.
 */
export interface SelectStatement {
    type: 'SELECT';
    columns: string[] | '*';
    tableName: string;
    where?: WhereCondition;
    join?: JoinClause;
}

/**
 * Parsed UPDATE statement.
 */
export interface UpdateStatement {
    type: 'UPDATE';
    tableName: string;
    set: Record<string, Value>;
    where?: WhereCondition;
}

/**
 * Parsed DELETE statement.
 */
export interface DeleteStatement {
    type: 'DELETE';
    tableName: string;
    where?: WhereCondition;
}

/**
 * Parsed SHOW TABLES statement.
 */
export interface ShowTablesStatement {
    type: 'SHOW_TABLES';
}

/**
 * Parsed DESCRIBE statement.
 */
export interface DescribeStatement {
    type: 'DESCRIBE';
    tableName: string;
}

/**
 * Union of all possible parsed statements.
 */
export type ParsedStatement =
    | CreateTableStatement
    | InsertStatement
    | SelectStatement
    | UpdateStatement
    | DeleteStatement
    | ShowTablesStatement
    | DescribeStatement;

// =============================================================================
// QUERY RESULTS
// =============================================================================

/**
 * Result of a successful query execution.
 */
export interface QueryResult {
    success: true;
    message?: string;
    rows?: Row[];
    rowCount?: number;
    columns?: string[];
}

/**
 * Result of a failed query execution.
 */
export interface QueryError {
    success: false;
    error: string;
}

/**
 * Union type for any query result.
 */
export type ExecutionResult = QueryResult | QueryError;

// =============================================================================
// STORAGE TYPES
// =============================================================================

/**
 * Serializable table data for persistence.
 */
export interface SerializedTable {
    schema: TableSchema;
    rows: InternalRow[];
    nextRowId: number;
}

/**
 * Serializable database state for persistence.
 */
export interface SerializedDatabase {
    version: string;
    tables: Record<string, SerializedTable>;
    createdAt: string;
    updatedAt: string;
}

// =============================================================================
// INDEX TYPES
// =============================================================================

/**
 * Hash index entry mapping a key to row IDs.
 * A single key can map to multiple rows for non-unique indexes.
 */
export type IndexEntry = Map<Value, Set<number>>;

/**
 * Index metadata and storage.
 */
export interface TableIndex {
    columnName: string;
    isUnique: boolean;
    entries: IndexEntry;
}
