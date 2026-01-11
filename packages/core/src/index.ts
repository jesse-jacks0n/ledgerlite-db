/**
 * LedgerLite - A Minimal Relational Database Management System
 * 
 * This is the main entry point for the LedgerLite core package.
 * It exports all public APIs for use by other packages or applications.
 * 
 * @packageDocumentation
 */

// Types
export * from './types';

// Storage
export { Database } from './storage/Database';
export { Table } from './storage/Table';

// Indexing
export { HashIndex } from './index/HashIndex';

// Parser
export { Parser } from './parser/Parser';
export { Tokenizer, Token, TokenType } from './parser/Tokenizer';

// Engine
export { QueryExecutor } from './engine/QueryExecutor';

// Join
export { innerJoin, JoinResult } from './join/JoinEngine';

// REPL
export { REPL } from './repl';

/**
 * Create a new LedgerLite database instance with a query executor.
 * This is a convenience function for quickly getting started.
 * 
 * @param name - Optional name for the database
 * @returns An object with the database and executor
 */
export function createDatabase(name: string = 'ledgerlite') {
    const { Database } = require('./storage/Database');
    const { QueryExecutor } = require('./engine/QueryExecutor');

    const database = new Database(name);
    const executor = new QueryExecutor(database);

    return { database, executor };
}
