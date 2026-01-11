/**
 * LedgerLite - Interactive REPL
 * 
 * Provides a command-line interface for interacting with the database.
 * 
 * Features:
 * - Multi-line SQL input (use semicolon to execute)
 * - Clear success/error output
 * - Pretty-printed table results
 * - Special commands: .help, .tables, .quit, .save, .load
 */

import * as readline from 'readline';
import { Database } from '../storage/Database';
import { QueryExecutor } from '../engine/QueryExecutor';
import { ExecutionResult, Row } from '../types';

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ██╗     ███████╗██████╗  ██████╗ ███████╗██████╗            ║
║   ██║     ██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔══██╗           ║
║   ██║     █████╗  ██║  ██║██║  ███╗█████╗  ██████╔╝           ║
║   ██║     ██╔══╝  ██║  ██║██║   ██║██╔══╝  ██╔══██╗           ║
║   ███████╗███████╗██████╔╝╚██████╔╝███████╗██║  ██║           ║
║   ╚══════╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═╝           ║
║                      ██╗     ██╗████████╗███████╗             ║
║                      ██║     ██║╚══██╔══╝██╔════╝             ║
║                      ██║     ██║   ██║   █████╗               ║
║                      ██║     ██║   ██║   ██╔══╝               ║
║                      ███████╗██║   ██║   ███████╗             ║
║                      ╚══════╝╚═╝   ╚═╝   ╚══════╝             ║
║                                                               ║
║   A minimal relational database management system             ║
║   Type .help for commands, or enter SQL to execute            ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`;

const HELP_TEXT = `
LedgerLite REPL Commands:
  .help          Show this help message
  .tables        List all tables
  .describe <t>  Describe table structure
  .save [path]   Save database to file
  .load [path]   Load database from file
  .clear         Clear the screen
  .quit          Exit the REPL

SQL Commands (end with semicolon):
  CREATE TABLE name (col1 TYPE [constraints], ...);
  INSERT INTO name (col1, ...) VALUES (val1, ...);
  SELECT col1, ... FROM table [INNER JOIN t2 ON ...] [WHERE col = val];
  UPDATE table SET col = val [WHERE col = val];
  DELETE FROM table [WHERE col = val];

Data Types: INT, TEXT, BOOL
Constraints: PRIMARY KEY, UNIQUE

Examples:
  CREATE TABLE users (id INT PRIMARY KEY, name TEXT, active BOOL);
  INSERT INTO users (id, name, active) VALUES (1, 'Alice', TRUE);
  SELECT * FROM users WHERE id = 1;
`;

export class REPL {
    private database: Database;
    private executor: QueryExecutor;
    private rl: readline.Interface;
    private buffer: string;
    private persistPath: string;
    private isRunning: boolean;

    constructor(database?: Database, persistPath?: string) {
        this.database = database || new Database('ledgerlite');
        this.executor = new QueryExecutor(this.database);
        this.buffer = '';
        this.persistPath = persistPath || './ledgerlite.db';
        this.isRunning = false;

        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    /**
     * Start the REPL.
     */
    start(): void {
        this.isRunning = true;
        console.log(BANNER);
        this.prompt();

        this.rl.on('line', (line) => {
            this.handleLine(line);
        });

        this.rl.on('close', () => {
            this.quit();
        });
    }

    /**
     * Display the prompt.
     */
    private prompt(): void {
        const promptChar = this.buffer ? '...> ' : 'sql> ';
        this.rl.setPrompt(promptChar);
        this.rl.prompt();
    }

    /**
     * Handle a line of input.
     */
    private handleLine(line: string): void {
        const trimmed = line.trim();

        // Check for special commands
        if (!this.buffer && trimmed.startsWith('.')) {
            this.handleCommand(trimmed);
            if (this.isRunning) {
                this.prompt();
            }
            return;
        }

        // Accumulate SQL
        this.buffer += (this.buffer ? '\n' : '') + line;

        // Check if statement is complete (ends with semicolon)
        if (this.buffer.trim().endsWith(';')) {
            this.executeBuffer();
        }

        if (this.isRunning) {
            this.prompt();
        }
    }

    /**
     * Execute accumulated SQL.
     */
    private executeBuffer(): void {
        const sql = this.buffer.trim();
        this.buffer = '';

        if (!sql || sql === ';') {
            return;
        }

        const startTime = Date.now();
        const result = this.executor.execute(sql);
        const elapsed = Date.now() - startTime;

        this.printResult(result, elapsed);
    }

    /**
     * Print query result.
     */
    private printResult(result: ExecutionResult, elapsed: number): void {
        if (!result.success) {
            console.log(`\n❌ Error: ${result.error}\n`);
            return;
        }

        if (result.rows && result.rows.length > 0) {
            console.log('');
            this.printTable(result.rows, result.columns || []);
            console.log(`✓ ${result.rowCount} row(s) returned (${elapsed}ms)\n`);
        } else if (result.message) {
            console.log(`\n✓ ${result.message} (${elapsed}ms)\n`);
        } else {
            console.log(`\n✓ Query executed (${elapsed}ms)\n`);
        }
    }

    /**
     * Print rows as a formatted table.
     */
    private printTable(rows: Row[], columns: string[]): void {
        if (rows.length === 0) {
            console.log('(empty result set)');
            return;
        }

        // Get columns from first row if not provided
        const cols = columns.length > 0 ? columns : Object.keys(rows[0]);

        // Calculate column widths
        const widths: Record<string, number> = {};
        for (const col of cols) {
            widths[col] = col.length;
        }

        for (const row of rows) {
            for (const col of cols) {
                const value = this.formatValue(row[col]);
                widths[col] = Math.max(widths[col], value.length);
            }
        }

        // Print header
        const headerRow = cols.map(col => col.padEnd(widths[col])).join(' │ ');
        const separator = cols.map(col => '─'.repeat(widths[col])).join('─┼─');

        console.log('┌─' + cols.map(col => '─'.repeat(widths[col])).join('─┬─') + '─┐');
        console.log('│ ' + headerRow + ' │');
        console.log('├─' + separator + '─┤');

        // Print rows
        for (const row of rows) {
            const rowStr = cols
                .map(col => this.formatValue(row[col]).padEnd(widths[col]))
                .join(' │ ');
            console.log('│ ' + rowStr + ' │');
        }

        console.log('└─' + cols.map(col => '─'.repeat(widths[col])).join('─┴─') + '─┘');
    }

    /**
     * Format a value for display.
     */
    private formatValue(value: unknown): string {
        if (value === null || value === undefined) {
            return 'NULL';
        }
        if (typeof value === 'boolean') {
            return value ? 'TRUE' : 'FALSE';
        }
        if (typeof value === 'string') {
            return value;
        }
        return String(value);
    }

    /**
     * Handle special commands.
     */
    private handleCommand(command: string): void {
        const parts = command.split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const arg = parts.slice(1).join(' ');

        switch (cmd) {
            case '.help':
                console.log(HELP_TEXT);
                break;

            case '.tables':
                this.executeBuffer();
                this.buffer = 'SHOW TABLES;';
                this.executeBuffer();
                break;

            case '.describe':
                if (!arg) {
                    console.log('Usage: .describe <table_name>');
                } else {
                    this.buffer = `DESCRIBE ${arg};`;
                    this.executeBuffer();
                }
                break;

            case '.save':
                this.saveDatabase(arg || this.persistPath);
                break;

            case '.load':
                this.loadDatabase(arg || this.persistPath);
                break;

            case '.clear':
                console.clear();
                break;

            case '.quit':
            case '.exit':
                this.quit();
                break;

            default:
                console.log(`Unknown command: ${cmd}. Type .help for available commands.`);
        }
    }

    /**
     * Save database to file.
     */
    private saveDatabase(path: string): void {
        try {
            this.database.save(path);
            console.log(`✓ Database saved to ${path}`);
        } catch (error) {
            console.log(`❌ Error saving database: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Load database from file.
     */
    private loadDatabase(path: string): void {
        try {
            this.database.load(path);
            this.executor = new QueryExecutor(this.database);
            console.log(`✓ Database loaded from ${path}`);
        } catch (error) {
            console.log(`❌ Error loading database: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Quit the REPL.
     */
    private quit(): void {
        this.isRunning = false;
        console.log('\nGoodbye! 👋\n');
        this.rl.close();
        process.exit(0);
    }
}

// Main entry point
if (require.main === module) {
    const repl = new REPL();
    repl.start();
}
