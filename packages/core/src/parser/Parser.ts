/**
 * LedgerLite - SQL Parser
 * 
 * Parses tokenized SQL into an Abstract Syntax Tree (AST) representation.
 * 
 * Supported grammar (simplified):
 * 
 * statement := create_table | insert | select | update | delete | show_tables | describe
 * 
 * create_table := CREATE TABLE identifier '(' column_defs ')'
 * column_defs := column_def (',' column_def)*
 * column_def := identifier type constraints?
 * type := INT | TEXT | BOOL
 * constraints := (PRIMARY KEY | UNIQUE)*
 * 
 * insert := INSERT INTO identifier '(' columns ')' VALUES '(' values ')'
 * columns := identifier (',' identifier)*
 * values := value (',' value)*
 * 
 * select := SELECT (columns | '*') FROM identifier (join_clause)? (where_clause)?
 * join_clause := INNER JOIN identifier ON column '=' column
 * where_clause := WHERE column '=' value
 * 
 * update := UPDATE identifier SET assignments (where_clause)?
 * assignments := assignment (',' assignment)*
 * assignment := identifier '=' value
 * 
 * delete := DELETE FROM identifier (where_clause)?
 * 
 * show_tables := SHOW TABLES
 * describe := DESCRIBE identifier
 */

import { Token, Tokenizer, TokenType } from './Tokenizer';
import {
    ParsedStatement,
    CreateTableStatement,
    InsertStatement,
    SelectStatement,
    UpdateStatement,
    DeleteStatement,
    ShowTablesStatement,
    DescribeStatement,
    ColumnDefinition,
    DataType,
    ConstraintType,
    WhereCondition,
    JoinClause,
    Value,
} from '../types';

export class Parser {
    private tokens: Token[];
    private current: number;

    constructor(input: string) {
        const tokenizer = new Tokenizer(input);
        this.tokens = tokenizer.tokenize();
        this.current = 0;
    }

    /**
     * Parse the input and return a parsed statement.
     */
    parse(): ParsedStatement {
        const statement = this.parseStatement();

        // Consume optional semicolon
        if (this.check('PUNCTUATION', ';')) {
            this.advance();
        }

        // Ensure we've consumed all tokens
        if (!this.isAtEnd()) {
            throw this.error(`Unexpected token: '${this.peek().value}'`);
        }

        return statement;
    }

    /**
     * Parse a single statement.
     */
    private parseStatement(): ParsedStatement {
        if (this.check('KEYWORD', 'CREATE')) {
            return this.parseCreateTable();
        }
        if (this.check('KEYWORD', 'INSERT')) {
            return this.parseInsert();
        }
        if (this.check('KEYWORD', 'SELECT')) {
            return this.parseSelect();
        }
        if (this.check('KEYWORD', 'UPDATE')) {
            return this.parseUpdate();
        }
        if (this.check('KEYWORD', 'DELETE')) {
            return this.parseDelete();
        }
        if (this.check('KEYWORD', 'SHOW')) {
            return this.parseShowTables();
        }
        if (this.check('KEYWORD', 'DESCRIBE')) {
            return this.parseDescribe();
        }

        throw this.error(
            `Expected statement, got '${this.peek().value}'. ` +
            `Supported: CREATE TABLE, INSERT, SELECT, UPDATE, DELETE, SHOW TABLES, DESCRIBE`
        );
    }

    /**
     * Parse CREATE TABLE statement.
     */
    private parseCreateTable(): CreateTableStatement {
        this.consume('KEYWORD', 'CREATE');
        this.consume('KEYWORD', 'TABLE');

        const tableName = this.consumeIdentifier();

        this.consume('PUNCTUATION', '(');
        const columns = this.parseColumnDefinitions();
        this.consume('PUNCTUATION', ')');

        return {
            type: 'CREATE_TABLE',
            tableName,
            columns,
        };
    }

    /**
     * Parse column definitions.
     */
    private parseColumnDefinitions(): ColumnDefinition[] {
        const columns: ColumnDefinition[] = [];

        columns.push(this.parseColumnDefinition());

        while (this.check('PUNCTUATION', ',')) {
            this.advance();
            columns.push(this.parseColumnDefinition());
        }

        return columns;
    }

    /**
     * Parse a single column definition.
     */
    private parseColumnDefinition(): ColumnDefinition {
        const name = this.consumeIdentifier();
        const type = this.parseDataType();
        const constraints = this.parseConstraints();

        return { name, type, constraints };
    }

    /**
     * Parse a data type.
     */
    private parseDataType(): DataType {
        const token = this.advance();

        if (token.type !== 'KEYWORD') {
            throw this.error(`Expected data type (INT, TEXT, BOOL), got '${token.value}'`);
        }

        const type = token.value.toUpperCase();
        if (type !== 'INT' && type !== 'TEXT' && type !== 'BOOL') {
            throw this.error(`Unknown data type: '${token.value}'. Supported: INT, TEXT, BOOL`);
        }

        return type as DataType;
    }

    /**
     * Parse column constraints.
     */
    private parseConstraints(): ConstraintType[] {
        const constraints: ConstraintType[] = [];

        while (true) {
            if (this.check('KEYWORD', 'PRIMARY')) {
                this.advance();
                this.consume('KEYWORD', 'KEY');
                constraints.push('PRIMARY_KEY');
            } else if (this.check('KEYWORD', 'UNIQUE')) {
                this.advance();
                constraints.push('UNIQUE');
            } else {
                break;
            }
        }

        return constraints;
    }

    /**
     * Parse INSERT statement.
     */
    private parseInsert(): InsertStatement {
        this.consume('KEYWORD', 'INSERT');
        this.consume('KEYWORD', 'INTO');

        const tableName = this.consumeIdentifier();

        this.consume('PUNCTUATION', '(');
        const columns = this.parseIdentifierList();
        this.consume('PUNCTUATION', ')');

        this.consume('KEYWORD', 'VALUES');

        this.consume('PUNCTUATION', '(');
        const values = this.parseValueList();
        this.consume('PUNCTUATION', ')');

        return {
            type: 'INSERT',
            tableName,
            columns,
            values,
        };
    }

    /**
     * Parse a list of identifiers.
     */
    private parseIdentifierList(): string[] {
        const identifiers: string[] = [];

        identifiers.push(this.consumeIdentifier());

        while (this.check('PUNCTUATION', ',')) {
            this.advance();
            identifiers.push(this.consumeIdentifier());
        }

        return identifiers;
    }

    /**
     * Parse a list of values.
     */
    private parseValueList(): Value[] {
        const values: Value[] = [];

        values.push(this.parseValue());

        while (this.check('PUNCTUATION', ',')) {
            this.advance();
            values.push(this.parseValue());
        }

        return values;
    }

    /**
     * Parse a single value.
     */
    private parseValue(): Value {
        const token = this.peek();

        if (token.type === 'NUMBER') {
            this.advance();
            return parseInt(token.value, 10);
        }

        if (token.type === 'STRING') {
            this.advance();
            return token.value;
        }

        if (token.type === 'BOOLEAN') {
            this.advance();
            return token.value === 'TRUE';
        }

        if (token.type === 'KEYWORD' && token.value === 'NULL') {
            this.advance();
            return null;
        }

        throw this.error(`Expected value, got '${token.value}'`);
    }

    /**
     * Parse SELECT statement.
     */
    private parseSelect(): SelectStatement {
        this.consume('KEYWORD', 'SELECT');

        let columns: string[] | '*';
        if (this.check('STAR')) {
            this.advance();
            columns = '*';
        } else {
            columns = this.parseColumnList();
        }

        this.consume('KEYWORD', 'FROM');
        const tableName = this.consumeIdentifier();

        let join: JoinClause | undefined;
        if (this.check('KEYWORD', 'INNER')) {
            join = this.parseJoinClause();
        }

        let where: WhereCondition | undefined;
        if (this.check('KEYWORD', 'WHERE')) {
            where = this.parseWhereClause();
        }

        return {
            type: 'SELECT',
            columns,
            tableName,
            join,
            where,
        };
    }

    /**
     * Parse a column list for SELECT.
     */
    private parseColumnList(): string[] {
        const columns: string[] = [];

        columns.push(this.parseColumnReference());

        while (this.check('PUNCTUATION', ',')) {
            this.advance();
            columns.push(this.parseColumnReference());
        }

        return columns;
    }

    /**
     * Parse a column reference (may include table.column format).
     */
    private parseColumnReference(): string {
        let name = this.consumeIdentifier();

        if (this.check('PUNCTUATION', '.')) {
            this.advance();
            const column = this.consumeIdentifier();
            name = `${name}.${column}`;
        }

        return name;
    }

    /**
     * Parse JOIN clause.
     */
    private parseJoinClause(): JoinClause {
        this.consume('KEYWORD', 'INNER');
        this.consume('KEYWORD', 'JOIN');

        const table = this.consumeIdentifier();

        this.consume('KEYWORD', 'ON');

        const leftColumn = this.parseColumnReference();
        this.consume('OPERATOR', '=');
        const rightColumn = this.parseColumnReference();

        return {
            type: 'INNER',
            table,
            leftColumn,
            rightColumn,
        };
    }

    /**
     * Parse WHERE clause.
     */
    private parseWhereClause(): WhereCondition {
        this.consume('KEYWORD', 'WHERE');

        const column = this.parseColumnReference();
        this.consume('OPERATOR', '=');
        const value = this.parseValue();

        return {
            column,
            operator: '=',
            value,
        };
    }

    /**
     * Parse UPDATE statement.
     */
    private parseUpdate(): UpdateStatement {
        this.consume('KEYWORD', 'UPDATE');

        const tableName = this.consumeIdentifier();

        this.consume('KEYWORD', 'SET');
        const set = this.parseAssignments();

        let where: WhereCondition | undefined;
        if (this.check('KEYWORD', 'WHERE')) {
            where = this.parseWhereClause();
        }

        return {
            type: 'UPDATE',
            tableName,
            set,
            where,
        };
    }

    /**
     * Parse SET assignments.
     */
    private parseAssignments(): Record<string, Value> {
        const assignments: Record<string, Value> = {};

        const first = this.parseAssignment();
        assignments[first.column] = first.value;

        while (this.check('PUNCTUATION', ',')) {
            this.advance();
            const assignment = this.parseAssignment();
            assignments[assignment.column] = assignment.value;
        }

        return assignments;
    }

    /**
     * Parse a single assignment.
     */
    private parseAssignment(): { column: string; value: Value } {
        const column = this.consumeIdentifier();
        this.consume('OPERATOR', '=');
        const value = this.parseValue();
        return { column, value };
    }

    /**
     * Parse DELETE statement.
     */
    private parseDelete(): DeleteStatement {
        this.consume('KEYWORD', 'DELETE');
        this.consume('KEYWORD', 'FROM');

        const tableName = this.consumeIdentifier();

        let where: WhereCondition | undefined;
        if (this.check('KEYWORD', 'WHERE')) {
            where = this.parseWhereClause();
        }

        return {
            type: 'DELETE',
            tableName,
            where,
        };
    }

    /**
     * Parse SHOW TABLES statement.
     */
    private parseShowTables(): ShowTablesStatement {
        this.consume('KEYWORD', 'SHOW');
        this.consume('KEYWORD', 'TABLES');

        return { type: 'SHOW_TABLES' };
    }

    /**
     * Parse DESCRIBE statement.
     */
    private parseDescribe(): DescribeStatement {
        this.consume('KEYWORD', 'DESCRIBE');
        const tableName = this.consumeIdentifier();

        return {
            type: 'DESCRIBE',
            tableName,
        };
    }

    // ==========================================================================
    // HELPER METHODS
    // ==========================================================================

    /**
     * Get the current token.
     */
    private peek(): Token {
        return this.tokens[this.current];
    }

    /**
     * Check if we've reached the end of tokens.
     */
    private isAtEnd(): boolean {
        return this.peek().type === 'EOF';
    }

    /**
     * Advance to the next token.
     */
    private advance(): Token {
        if (!this.isAtEnd()) {
            this.current++;
        }
        return this.tokens[this.current - 1];
    }

    /**
     * Check if current token matches expected type and value.
     */
    private check(type: TokenType, value?: string): boolean {
        if (this.isAtEnd()) return false;
        const token = this.peek();
        if (token.type !== type) return false;
        if (value !== undefined && token.value !== value) return false;
        return true;
    }

    /**
     * Consume expected token or throw error.
     */
    private consume(type: TokenType, value?: string): Token {
        if (this.check(type, value)) {
            return this.advance();
        }

        const token = this.peek();
        const expected = value ? `'${value}'` : type;
        throw this.error(`Expected ${expected}, got '${token.value}'`);
    }

    /**
     * Consume an identifier token.
     */
    private consumeIdentifier(): string {
        const token = this.peek();
        if (token.type === 'IDENTIFIER') {
            this.advance();
            return token.value;
        }
        // Also allow keywords as identifiers (table/column names)
        if (token.type === 'KEYWORD') {
            this.advance();
            return token.value.toLowerCase();
        }
        throw this.error(`Expected identifier, got '${token.value}'`);
    }

    /**
     * Create a parse error with position information.
     */
    private error(message: string): Error {
        const token = this.peek();
        return new Error(
            `Parse error at line ${token.line}, column ${token.column}: ${message}`
        );
    }
}
