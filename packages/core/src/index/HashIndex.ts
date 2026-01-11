/**
 * LedgerLite - Hash Index
 * 
 * Implements a hash-based index for fast lookups on PRIMARY KEY and UNIQUE columns.
 * 
 * Design decisions:
 * - Uses JavaScript Map for O(1) average-case lookups
 * - Each key maps to a Set of row IDs (supports non-unique indexes in the future)
 * - Index is maintained incrementally on insert/update/delete
 * - No rehashing needed - JavaScript Map handles this automatically
 * 
 * Time complexity:
 * - Lookup: O(1) average
 * - Insert: O(1) average
 * - Delete: O(1) average
 * - Update: O(1) average (delete old + insert new)
 */

import { Value } from '../types';

export class HashIndex {
    private columnName: string;
    private isUnique: boolean;
    private entries: Map<string, Set<number>>; // key hash -> row IDs

    constructor(columnName: string, isUnique: boolean = false) {
        this.columnName = columnName;
        this.isUnique = isUnique;
        this.entries = new Map();
    }

    /**
     * Get the column name this index is built on.
     */
    getColumnName(): string {
        return this.columnName;
    }

    /**
     * Check if this is a unique index.
     */
    getIsUnique(): boolean {
        return this.isUnique;
    }

    /**
     * Convert a value to a consistent hash key string.
     * This handles type coercion and null values.
     */
    private hashKey(value: Value): string {
        if (value === null || value === undefined) {
            return '__NULL__';
        }
        // Prefix with type to avoid collisions (e.g., 1 vs "1")
        const type = typeof value;
        return `${type}:${String(value)}`;
    }

    /**
     * Add a value-to-rowId mapping to the index.
     */
    add(value: Value, rowId: number): void {
        const key = this.hashKey(value);

        let rowIds = this.entries.get(key);
        if (!rowIds) {
            rowIds = new Set();
            this.entries.set(key, rowIds);
        }

        rowIds.add(rowId);
    }

    /**
     * Remove a value-to-rowId mapping from the index.
     */
    remove(value: Value, rowId: number): void {
        const key = this.hashKey(value);
        const rowIds = this.entries.get(key);

        if (rowIds) {
            rowIds.delete(rowId);
            if (rowIds.size === 0) {
                this.entries.delete(key);
            }
        }
    }

    /**
     * Look up row IDs by value.
     * Returns an empty set if the value is not found.
     */
    lookup(value: Value): Set<number> {
        const key = this.hashKey(value);
        return this.entries.get(key) || new Set();
    }

    /**
     * Check if a value exists in the index.
     */
    has(value: Value): boolean {
        const key = this.hashKey(value);
        const rowIds = this.entries.get(key);
        return rowIds !== undefined && rowIds.size > 0;
    }

    /**
     * Get the number of unique values in the index.
     */
    size(): number {
        return this.entries.size;
    }

    /**
     * Clear all entries from the index.
     */
    clear(): void {
        this.entries.clear();
    }

    /**
     * Get statistics about the index.
     */
    getStats(): { uniqueKeys: number; totalEntries: number } {
        let totalEntries = 0;
        for (const rowIds of this.entries.values()) {
            totalEntries += rowIds.size;
        }
        return {
            uniqueKeys: this.entries.size,
            totalEntries,
        };
    }
}
