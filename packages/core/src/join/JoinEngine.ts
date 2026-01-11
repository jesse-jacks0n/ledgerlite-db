/**
 * LedgerLite - Join Engine
 * 
 * Implements INNER JOIN using a nested-loop algorithm.
 * 
 * Design decisions:
 * - Uses simple nested-loop join for clarity
 * - Supports only equality conditions
 * - Two-table joins only (as per spec)
 * 
 * Time Complexity:
 * - Without index: O(n * m) where n and m are row counts of the two tables
 * - With index on join column: O(n * k) where k is average matches per key
 * 
 * Trade-offs:
 * - Simple and easy to understand
 * - Not optimal for large tables (hash join or sort-merge would be better)
 * - Acceptable for a learning/demonstration project
 */

import { Table } from '../storage/Table';
import { Row, JoinClause } from '../types';

export interface JoinResult {
    rows: Row[];
    columns: string[];
}

/**
 * Parse a column reference into table and column parts.
 */
function parseColumnRef(ref: string): { table?: string; column: string } {
    const parts = ref.split('.');
    if (parts.length === 2) {
        return { table: parts[0].toLowerCase(), column: parts[1] };
    }
    return { column: parts[0] };
}

/**
 * Perform an INNER JOIN between two tables.
 * 
 * @param leftTable - The left table (FROM clause)
 * @param rightTable - The right table (JOIN clause)
 * @param joinClause - The join condition
 * @param selectColumns - Columns to include in results, or '*' for all
 * @returns Join result with rows and column names
 */
export function innerJoin(
    leftTable: Table,
    rightTable: Table,
    joinClause: JoinClause,
    selectColumns: string[] | '*'
): JoinResult {
    const leftName = leftTable.getName().toLowerCase();
    const rightName = rightTable.getName().toLowerCase();

    // Parse join condition
    const leftRef = parseColumnRef(joinClause.leftColumn);
    const rightRef = parseColumnRef(joinClause.rightColumn);

    // Determine which column belongs to which table
    let leftJoinCol: string;
    let rightJoinCol: string;

    if (leftRef.table === leftName) {
        leftJoinCol = leftRef.column;
        rightJoinCol = rightRef.column;
    } else if (leftRef.table === rightName) {
        leftJoinCol = rightRef.column;
        rightJoinCol = leftRef.column;
    } else if (rightRef.table === leftName) {
        leftJoinCol = rightRef.column;
        rightJoinCol = leftRef.column;
    } else {
        // No table prefix, try to match by column existence
        if (leftTable.hasColumn(leftRef.column)) {
            leftJoinCol = leftRef.column;
            rightJoinCol = rightRef.column;
        } else {
            leftJoinCol = rightRef.column;
            rightJoinCol = leftRef.column;
        }
    }

    // Validate join columns exist
    if (!leftTable.hasColumn(leftJoinCol)) {
        throw new Error(`Column '${leftJoinCol}' not found in table '${leftName}'`);
    }
    if (!rightTable.hasColumn(rightJoinCol)) {
        throw new Error(`Column '${rightJoinCol}' not found in table '${rightName}'`);
    }

    // Determine output columns
    let outputColumns: string[];
    if (selectColumns === '*') {
        outputColumns = [
            ...leftTable.getColumns().map(c => `${leftName}.${c.name}`),
            ...rightTable.getColumns().map(c => `${rightName}.${c.name}`),
        ];
    } else {
        outputColumns = selectColumns;
    }

    // Get all rows from both tables
    const leftRows = leftTable.getAllRows();
    const rightRows = rightTable.getAllRows();

    // Check if we can use an index on the right table
    const rightIndex = rightTable.getIndex(rightJoinCol);

    const resultRows: Row[] = [];

    // Nested-loop join (with optional index optimization)
    for (const leftRow of leftRows) {
        const leftValue = leftRow.data[leftJoinCol];

        let matchingRightRows: Row[];

        if (rightIndex) {
            // Use index for O(1) lookup
            const rowIds = rightIndex.lookup(leftValue);
            matchingRightRows = Array.from(rowIds)
                .map(id => rightTable.getRowById(id))
                .filter((r): r is NonNullable<typeof r> => r !== undefined)
                .map(r => r.data);
        } else {
            // Full scan of right table
            matchingRightRows = rightRows
                .filter(r => r.data[rightJoinCol] === leftValue)
                .map(r => r.data);
        }

        // Create joined rows
        for (const rightRow of matchingRightRows) {
            const joinedRow: Row = {};

            for (const col of outputColumns) {
                const ref = parseColumnRef(col);

                if (ref.table === leftName) {
                    joinedRow[col] = leftRow.data[ref.column];
                } else if (ref.table === rightName) {
                    joinedRow[col] = rightRow[ref.column];
                } else {
                    // No table prefix, try left then right
                    if (leftRow.data[ref.column] !== undefined) {
                        joinedRow[col] = leftRow.data[ref.column];
                    } else if (rightRow[ref.column] !== undefined) {
                        joinedRow[col] = rightRow[ref.column];
                    }
                }
            }

            resultRows.push(joinedRow);
        }
    }

    return {
        rows: resultRows,
        columns: outputColumns,
    };
}
