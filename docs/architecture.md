# LedgerLite Architecture

## Overview

LedgerLite is a minimal relational database management system (RDBMS) designed to demonstrate core database concepts in a clear, understandable way. This document describes the architectural decisions, component interactions, and implementation details.

## Design Principles

1. **Clarity over Performance**: Code is optimized for readability, not speed
2. **Minimal Dependencies**: Uses only Node.js built-in modules where possible
3. **Separation of Concerns**: Clear boundaries between parsing, execution, and storage
4. **Explicit Trade-offs**: Limitations are documented, not hidden

---

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
├─────────────────────────────────────────────────────────────────┤
│     REPL (CLI)          │           Web Demo (HTTP)             │
└─────────────────────────┴───────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Query Interface                           │
├─────────────────────────────────────────────────────────────────┤
│                     QueryExecutor.execute(sql)                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
┌───────────────────────────────────┐   ┌─────────────────────────────┐
│          Parser                   │   │       Join Engine           │
├───────────────────────────────────┤   ├─────────────────────────────┤
│  Tokenizer → Parser → AST         │   │  innerJoin(left, right,     │
│                                   │   │            condition)       │
└───────────────────────────────────┘   └─────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Storage Engine                             │
├─────────────────────────────────────────────────────────────────┤
│  Database                                                       │
│  ├── Table (users)                                              │
│  │   ├── Schema                                                 │
│  │   ├── Rows (Map<rowId, InternalRow>)                         │
│  │   └── Indexes (Map<columnName, HashIndex>)                   │
│  └── Table (orders)                                             │
│      └── ...                                                    │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Persistence (Optional)                     │
├─────────────────────────────────────────────────────────────────┤
│              JSON serialization to disk                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Details

### 1. Types (`types/index.ts`)

Defines all TypeScript interfaces used throughout the system:

- **Data Types**: `INT`, `TEXT`, `BOOL`
- **Schema Types**: `ColumnDefinition`, `TableSchema`, `ConstraintType`
- **Query Types**: Parsed statement representations (AST nodes)
- **Result Types**: `QueryResult`, `QueryError`, `ExecutionResult`

**Design Decision**: Strong typing ensures compile-time safety and serves as documentation for the data structures.

### 2. Storage Engine

#### Database (`storage/Database.ts`)

The top-level container for all tables:

```typescript
class Database {
  private tables: Map<string, Table>;
  
  createTable(schema: TableSchema): Table;
  getTable(name: string): Table | undefined;
  save(path: string): void;    // Persistence
  load(path: string): void;    // Persistence
}
```

**Responsibilities**:
- Table lifecycle management
- Schema validation (duplicate columns, primary key rules)
- Serialization/deserialization for persistence

#### Table (`storage/Table.ts`)

Stores rows and manages indexes for a single table:

```typescript
class Table {
  private schema: TableSchema;
  private rows: Map<number, InternalRow>;
  private indexes: Map<string, HashIndex>;
  
  insert(columns: string[], values: Value[]): number;
  select(columns: string[] | '*', predicate?: Function): Row[];
  update(updates: Record<string, Value>, predicate?: Function): number;
  delete(predicate?: Function): number;
}
```

**Key Features**:
- Type validation on insert/update
- Constraint enforcement (PRIMARY KEY, UNIQUE)
- Automatic index maintenance
- Internal row IDs for stable references

**Design Decision**: Using `Map<rowId, Row>` instead of an array allows O(1) deletions without shifting elements.

### 3. Indexing (`index/HashIndex.ts`)

Hash-based index for fast equality lookups:

```typescript
class HashIndex {
  private entries: Map<string, Set<number>>;
  
  add(value: Value, rowId: number): void;
  remove(value: Value, rowId: number): void;
  lookup(value: Value): Set<number>;
}
```

**Time Complexity**:
| Operation | Complexity |
|-----------|------------|
| Lookup    | O(1) avg   |
| Insert    | O(1) avg   |
| Delete    | O(1) avg   |

**Trade-off**: Hash indexes only support equality comparisons. Range queries (>, <, BETWEEN) would require B-tree indexes.

### 4. Parser

#### Tokenizer (`parser/Tokenizer.ts`)

Converts SQL text into a stream of tokens:

```
"SELECT * FROM users WHERE id = 1"
    ↓
[
  { type: 'KEYWORD', value: 'SELECT' },
  { type: 'STAR', value: '*' },
  { type: 'KEYWORD', value: 'FROM' },
  { type: 'IDENTIFIER', value: 'users' },
  { type: 'KEYWORD', value: 'WHERE' },
  { type: 'IDENTIFIER', value: 'id' },
  { type: 'OPERATOR', value: '=' },
  { type: 'NUMBER', value: '1' },
]
```

**Features**:
- Position tracking for error messages
- Support for strings with escape sequences
- Line comments (-- comment)

#### Parser (`parser/Parser.ts`)

Recursive descent parser that builds an AST:

```
Tokens → ParsedStatement (AST)
```

**Supported Grammar** (simplified):
```
statement := create_table | insert | select | update | delete
select := SELECT columns FROM table [join] [where]
join := INNER JOIN table ON column = column
where := WHERE column = value
```

**Design Decision**: Recursive descent parsing is simple to implement and debug. A full SQL grammar would require a more sophisticated parser generator.

### 5. Query Executor (`engine/QueryExecutor.ts`)

Bridges parsing and storage:

```typescript
class QueryExecutor {
  execute(sql: string): ExecutionResult {
    const ast = parser.parse(sql);
    return this.executeStatement(ast);
  }
}
```

**Optimization**: Automatically uses indexes when WHERE clause targets a PRIMARY KEY column:

```typescript
if (this.canUseIndex(table, where)) {
  return this.selectWithIndex(table, columns, where);
} else {
  return table.select(columns, predicate);
}
```

### 6. Join Engine (`join/JoinEngine.ts`)

Implements INNER JOIN using nested-loop algorithm:

```typescript
function innerJoin(
  leftTable: Table,
  rightTable: Table,
  joinClause: JoinClause,
  selectColumns: string[] | '*'
): JoinResult
```

**Algorithm**:
```
for each row in leftTable:
    for each row in rightTable:
        if leftRow.joinCol == rightRow.joinCol:
            emit combined row
```

**Time Complexity**: O(n × m) without index, O(n × k) with index on right table's join column.

**Trade-off**: Nested-loop is simple but inefficient for large tables. Hash join or sort-merge join would be faster but more complex.

### 7. REPL (`repl/index.ts`)

Interactive command-line interface:

```
sql> CREATE TABLE users (id INT PRIMARY KEY, name TEXT);
✓ Table 'users' created successfully (2ms)

sql> INSERT INTO users (id, name) VALUES (1, 'Alice');
✓ 1 row inserted (1ms)

sql> SELECT * FROM users;
┌────┬───────┐
│ id │ name  │
├────┼───────┤
│ 1  │ Alice │
└────┴───────┘
✓ 1 row(s) returned (0ms)
```

**Features**:
- Multi-line input (waits for semicolon)
- Pretty-printed table output
- Special commands (.help, .tables, .save, .load)
- Persistence commands

---

## Data Flow

### SELECT Query Execution

```
1. User Input
   "SELECT name FROM users WHERE id = 1;"
   
2. Tokenization
   → [SELECT, name, FROM, users, WHERE, id, =, 1, ;]
   
3. Parsing
   → SelectStatement {
       type: 'SELECT',
       columns: ['name'],
       tableName: 'users',
       where: { column: 'id', operator: '=', value: 1 }
     }
     
4. Execution
   a. Get table 'users'
   b. Check if 'id' has an index (it does - PRIMARY KEY)
   c. Use index.lookup(1) → Set { rowId: 5 }
   d. Get row by rowId
   e. Project requested columns
   
5. Result
   → { success: true, rows: [{ name: 'Alice' }], rowCount: 1 }
```

### INSERT with Constraint Checking

```
1. Validate column names exist
2. Validate value types match column types
3. Check PRIMARY KEY not null
4. Check UNIQUE constraints via index lookup
5. If all pass:
   a. Assign new rowId
   b. Store row
   c. Update all indexes
6. Return success or constraint violation error
```

---

## Persistence Model

LedgerLite uses JSON serialization for optional persistence:

```json
{
  "version": "1.0.0",
  "tables": {
    "users": {
      "schema": { ... },
      "rows": [ ... ],
      "nextRowId": 5
    }
  },
  "createdAt": "2026-01-11T...",
  "updatedAt": "2026-01-11T..."
}
```

**Limitations**:
- No write-ahead logging (WAL)
- No crash recovery
- Full database serialized on each save

---

## Locked Feature Checklist

### Core RDBMS Features
- [x] In-memory row-based storage
- [x] Table abstraction with schema + rows
- [x] Optional persistence (JSON serialization)
- [x] Deterministic row IDs

### Schema & Types
- [x] INT, TEXT, BOOL data types
- [x] PRIMARY KEY constraint
- [x] UNIQUE constraint
- [x] Constraint enforcement on INSERT/UPDATE

### SQL-like Interface
- [x] CREATE TABLE
- [x] INSERT INTO
- [x] SELECT
- [x] UPDATE
- [x] DELETE
- [x] WHERE column = value
- [x] INNER JOIN on equality

### Parser
- [x] Token-based parser
- [x] Clear separation parsing/execution
- [x] Human-readable error messages

### Indexing
- [x] Hash index on PRIMARY KEY
- [x] Index maps key → row ID
- [x] Index maintained on INSERT/UPDATE/DELETE
- [x] Index used automatically for PK lookups

### Joins
- [x] INNER JOIN only
- [x] Two tables only
- [x] Equality condition only
- [x] Nested-loop implementation

### REPL
- [x] Interactive CLI
- [x] Multi-line SQL input
- [x] Clear success/error output
- [x] SHOW TABLES / DESCRIBE

### Demo Web App
- [x] HTTP server
- [x] CRUD endpoints
- [x] Minimal UI
- [x] One entity (products)

---

## Explicit Limitations

| Feature | Why Not Included |
|---------|------------------|
| Transactions | Would require WAL, locking, MVCC |
| Concurrency | Single-threaded by design for simplicity |
| Aggregations | Would need expression evaluation |
| ORDER BY | Would need sorting implementation |
| Subqueries | Would need recursive query execution |
| NULL semantics | Three-valued logic is complex |
| Multiple JOINs | Would need query planner |

---

## File Structure

```
packages/core/src/
├── index.ts              # Main exports
├── types/
│   └── index.ts          # All type definitions
├── storage/
│   ├── index.ts          # Module exports
│   ├── Database.ts       # Database container
│   └── Table.ts          # Table storage
├── index/
│   ├── index.ts          # Module exports
│   └── HashIndex.ts      # Hash-based index
├── parser/
│   ├── index.ts          # Module exports
│   ├── Tokenizer.ts      # SQL tokenization
│   └── Parser.ts         # AST generation
├── engine/
│   ├── index.ts          # Module exports
│   └── QueryExecutor.ts  # Query execution
├── join/
│   ├── index.ts          # Module exports
│   └── JoinEngine.ts     # Join implementation
└── repl/
    └── index.ts          # Interactive CLI
```

---

*This architecture document is part of the LedgerLite project for the Pesapal Junior Developer Challenge 2026.*
