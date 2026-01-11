/**
 * LedgerLite - SQL Tokenizer
 * 
 * Converts raw SQL input into a stream of tokens for parsing.
 * 
 * Design decisions:
 * - Simple regex-based tokenization for clarity
 * - Supports strings with single quotes
 * - Case-insensitive keywords
 * - Clear error messages with position information
 */

export type TokenType =
    | 'KEYWORD'
    | 'IDENTIFIER'
    | 'NUMBER'
    | 'STRING'
    | 'BOOLEAN'
    | 'OPERATOR'
    | 'PUNCTUATION'
    | 'STAR'
    | 'EOF';

export interface Token {
    type: TokenType;
    value: string;
    position: number;
    line: number;
    column: number;
}

// SQL keywords we recognize
const KEYWORDS = new Set([
    'CREATE', 'TABLE', 'INSERT', 'INTO', 'VALUES', 'SELECT', 'FROM',
    'WHERE', 'UPDATE', 'SET', 'DELETE', 'INNER', 'JOIN', 'ON',
    'INT', 'TEXT', 'BOOL', 'PRIMARY', 'KEY', 'UNIQUE', 'AND', 'OR',
    'NULL', 'NOT', 'SHOW', 'TABLES', 'DESCRIBE', 'DROP',
    'TRUE', 'FALSE'
]);

// Operators
const OPERATORS = new Set(['=', '<', '>', '<=', '>=', '<>', '!=']);

// Punctuation
const PUNCTUATION = new Set(['(', ')', ',', ';', '.']);

export class Tokenizer {
    private input: string;
    private position: number;
    private line: number;
    private column: number;
    private tokens: Token[];

    constructor(input: string) {
        this.input = input;
        this.position = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
    }

    /**
     * Tokenize the entire input.
     */
    tokenize(): Token[] {
        while (this.position < this.input.length) {
            this.skipWhitespace();

            if (this.position >= this.input.length) {
                break;
            }

            const char = this.input[this.position];

            // Comments (skip)
            if (char === '-' && this.peek(1) === '-') {
                this.skipLineComment();
                continue;
            }

            // String literals
            if (char === "'") {
                this.readString();
                continue;
            }

            // Numbers (including negative)
            if (this.isDigit(char) || (char === '-' && this.isDigit(this.peek(1) || ''))) {
                this.readNumber();
                continue;
            }

            // Identifiers and keywords
            if (this.isAlpha(char) || char === '_') {
                this.readIdentifier();
                continue;
            }

            // Star (for SELECT *)
            if (char === '*') {
                this.addToken('STAR', '*');
                this.advance();
                continue;
            }

            // Multi-character operators
            if (char === '<' || char === '>' || char === '!') {
                this.readOperator();
                continue;
            }

            // Single-character operators
            if (OPERATORS.has(char)) {
                this.addToken('OPERATOR', char);
                this.advance();
                continue;
            }

            // Punctuation
            if (PUNCTUATION.has(char)) {
                this.addToken('PUNCTUATION', char);
                this.advance();
                continue;
            }

            throw new Error(
                `Unexpected character '${char}' at line ${this.line}, column ${this.column}`
            );
        }

        this.addToken('EOF', '');
        return this.tokens;
    }

    /**
     * Get the next character without advancing.
     */
    private peek(offset: number = 0): string | undefined {
        return this.input[this.position + offset];
    }

    /**
     * Advance the position and update line/column tracking.
     */
    private advance(): string {
        const char = this.input[this.position];
        this.position++;

        if (char === '\n') {
            this.line++;
            this.column = 1;
        } else {
            this.column++;
        }

        return char;
    }

    /**
     * Add a token to the list.
     */
    private addToken(type: TokenType, value: string): void {
        this.tokens.push({
            type,
            value,
            position: this.position,
            line: this.line,
            column: this.column,
        });
    }

    /**
     * Skip whitespace characters.
     */
    private skipWhitespace(): void {
        while (this.position < this.input.length) {
            const char = this.input[this.position];
            if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
                this.advance();
            } else {
                break;
            }
        }
    }

    /**
     * Skip line comments (-- comment).
     */
    private skipLineComment(): void {
        while (this.position < this.input.length && this.input[this.position] !== '\n') {
            this.advance();
        }
    }

    /**
     * Check if character is a digit.
     */
    private isDigit(char: string): boolean {
        return char >= '0' && char <= '9';
    }

    /**
     * Check if character is alphabetic.
     */
    private isAlpha(char: string): boolean {
        return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
    }

    /**
     * Check if character is alphanumeric or underscore.
     */
    private isAlphaNumeric(char: string): boolean {
        return this.isAlpha(char) || this.isDigit(char) || char === '_';
    }

    /**
     * Read a string literal.
     */
    private readString(): void {
        const startLine = this.line;
        const startColumn = this.column;

        this.advance(); // consume opening quote

        let value = '';
        while (this.position < this.input.length) {
            const char = this.input[this.position];

            if (char === "'") {
                // Check for escaped quote ('')
                if (this.peek(1) === "'") {
                    value += "'";
                    this.advance();
                    this.advance();
                } else {
                    this.advance(); // consume closing quote
                    this.addToken('STRING', value);
                    return;
                }
            } else {
                value += this.advance();
            }
        }

        throw new Error(
            `Unterminated string starting at line ${startLine}, column ${startColumn}`
        );
    }

    /**
     * Read a number literal.
     */
    private readNumber(): void {
        let value = '';

        // Handle negative sign
        if (this.input[this.position] === '-') {
            value += this.advance();
        }

        while (this.position < this.input.length && this.isDigit(this.input[this.position])) {
            value += this.advance();
        }

        this.addToken('NUMBER', value);
    }

    /**
     * Read an identifier or keyword.
     */
    private readIdentifier(): void {
        let value = '';

        while (
            this.position < this.input.length &&
            this.isAlphaNumeric(this.input[this.position])
        ) {
            value += this.advance();
        }

        const upperValue = value.toUpperCase();

        // Check for boolean literals
        if (upperValue === 'TRUE' || upperValue === 'FALSE') {
            this.addToken('BOOLEAN', upperValue);
        }
        // Check for keywords
        else if (KEYWORDS.has(upperValue)) {
            this.addToken('KEYWORD', upperValue);
        }
        // It's an identifier
        else {
            this.addToken('IDENTIFIER', value);
        }
    }

    /**
     * Read a multi-character operator.
     */
    private readOperator(): void {
        let value = this.advance();

        const next = this.peek();
        if (next === '=' || next === '>') {
            value += this.advance();
        }

        if (OPERATORS.has(value)) {
            this.addToken('OPERATOR', value);
        } else {
            throw new Error(
                `Unknown operator '${value}' at line ${this.line}, column ${this.column}`
            );
        }
    }
}
