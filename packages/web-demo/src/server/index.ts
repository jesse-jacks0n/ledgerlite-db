/**
 * LedgerLite Web Demo - HTTP Server
 * 
 * A minimal HTTP server that provides CRUD endpoints for a "products" entity.
 * Uses Node.js built-in http module to avoid external dependencies.
 * 
 * Design decisions:
 * - Uses native Node.js http module (no Express/Koa)
 * - RESTful API design
 * - Direct integration with LedgerLite
 * - Simple JSON request/response
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

// Import from core package - using dist path
import { Database } from '../../../core/dist/storage/Database';
import { QueryExecutor } from '../../../core/dist/engine/QueryExecutor';

const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, '..', 'public');

// Initialize database and executor
const database = new Database('web-demo');
const executor = new QueryExecutor(database);

// Initialize the products table
function initializeDatabase(): void {
    const createTable = `
    CREATE TABLE products (
      id INT PRIMARY KEY,
      name TEXT,
      price INT,
      in_stock BOOL
    );
  `;

    const result = executor.execute(createTable);
    if (result.success) {
        console.log('✓ Products table created');

        // Insert some sample data
        const samples = [
            "INSERT INTO products (id, name, price, in_stock) VALUES (1, 'Laptop', 999, TRUE);",
            "INSERT INTO products (id, name, price, in_stock) VALUES (2, 'Mouse', 29, TRUE);",
            "INSERT INTO products (id, name, price, in_stock) VALUES (3, 'Keyboard', 79, FALSE);",
            "INSERT INTO products (id, name, price, in_stock) VALUES (4, 'Monitor', 299, TRUE);",
        ];

        for (const sql of samples) {
            executor.execute(sql);
        }
        console.log('✓ Sample products inserted');
    }
}

// Parse JSON body from request
function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        });
        req.on('error', reject);
    });
}

// Send JSON response
function sendJSON(
    res: http.ServerResponse,
    data: unknown,
    status: number = 200
): void {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
}

// Serve static files
function serveStatic(res: http.ServerResponse, filePath: string): void {
    const ext = path.extname(filePath);
    const contentTypes: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
    };

    const fullPath = path.join(STATIC_DIR, filePath);

    fs.readFile(fullPath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }

        res.writeHead(200, {
            'Content-Type': contentTypes[ext] || 'application/octet-stream'
        });
        res.end(data);
    });
}

// Get all products
function getProducts(): { success: boolean; data?: unknown[]; error?: string } {
    const result = executor.execute('SELECT * FROM products;');
    if (result.success && 'rows' in result) {
        return { success: true, data: result.rows };
    }
    return { success: false, error: 'error' in result ? result.error : 'Unknown error' };
}

// Get product by ID
function getProduct(id: number): { success: boolean; data?: unknown; error?: string } {
    const result = executor.execute(`SELECT * FROM products WHERE id = ${id};`);
    if (result.success && 'rows' in result) {
        if (result.rows && result.rows.length > 0) {
            return { success: true, data: result.rows[0] };
        }
        return { success: false, error: 'Product not found' };
    }
    return { success: false, error: 'error' in result ? result.error : 'Unknown error' };
}

// Create product
function createProduct(data: Record<string, unknown>): { success: boolean; message?: string; error?: string } {
    const { id, name, price, in_stock } = data;

    if (id === undefined || !name || price === undefined) {
        return { success: false, error: 'Missing required fields: id, name, price' };
    }

    const sql = `INSERT INTO products (id, name, price, in_stock) VALUES (${id}, '${name}', ${price}, ${in_stock ?? true});`;
    const result = executor.execute(sql);

    if (result.success) {
        return { success: true, message: 'Product created' };
    }
    return { success: false, error: 'error' in result ? result.error : 'Unknown error' };
}

// Update product
function updateProduct(id: number, data: Record<string, unknown>): { success: boolean; message?: string; error?: string } {
    const updates: string[] = [];

    if (data.name !== undefined) {
        updates.push(`name = '${data.name}'`);
    }
    if (data.price !== undefined) {
        updates.push(`price = ${data.price}`);
    }
    if (data.in_stock !== undefined) {
        updates.push(`in_stock = ${data.in_stock}`);
    }

    if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
    }

    const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ${id};`;
    const result = executor.execute(sql);

    if (result.success) {
        if ('rowCount' in result && result.rowCount === 0) {
            return { success: false, error: 'Product not found' };
        }
        return { success: true, message: 'Product updated' };
    }
    return { success: false, error: 'error' in result ? result.error : 'Unknown error' };
}

// Delete product
function deleteProduct(id: number): { success: boolean; message?: string; error?: string } {
    const sql = `DELETE FROM products WHERE id = ${id};`;
    const result = executor.execute(sql);

    if (result.success) {
        if ('rowCount' in result && result.rowCount === 0) {
            return { success: false, error: 'Product not found' };
        }
        return { success: true, message: 'Product deleted' };
    }
    return { success: false, error: 'error' in result ? result.error : 'Unknown error' };
}

// Execute raw SQL (for demo purposes)
function executeSQL(sql: string): { success: boolean; result?: unknown; error?: string } {
    const result = executor.execute(sql);
    if (result.success) {
        return { success: true, result };
    }
    return { success: false, error: 'error' in result ? result.error : 'Unknown error' };
}

// Request handler
async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse
): Promise<void> {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const method = req.method || 'GET';
    const pathname = url.pathname;

    console.log(`${method} ${pathname}`);

    // CORS preflight
    if (method === 'OPTIONS') {
        sendJSON(res, {});
        return;
    }

    // API routes
    if (pathname.startsWith('/api/')) {
        try {
            // Products API
            if (pathname === '/api/products') {
                if (method === 'GET') {
                    const result = getProducts();
                    sendJSON(res, result, result.success ? 200 : 500);
                    return;
                }
                if (method === 'POST') {
                    const body = await parseBody(req);
                    const result = createProduct(body);
                    sendJSON(res, result, result.success ? 201 : 400);
                    return;
                }
            }

            // Single product by ID
            const productMatch = pathname.match(/^\/api\/products\/(\d+)$/);
            if (productMatch) {
                const id = parseInt(productMatch[1], 10);

                if (method === 'GET') {
                    const result = getProduct(id);
                    sendJSON(res, result, result.success ? 200 : 404);
                    return;
                }
                if (method === 'PUT') {
                    const body = await parseBody(req);
                    const result = updateProduct(id, body);
                    sendJSON(res, result, result.success ? 200 : 400);
                    return;
                }
                if (method === 'DELETE') {
                    const result = deleteProduct(id);
                    sendJSON(res, result, result.success ? 200 : 404);
                    return;
                }
            }

            // Raw SQL endpoint (for demo)
            if (pathname === '/api/sql' && method === 'POST') {
                const body = await parseBody(req);
                if (typeof body.sql === 'string') {
                    const result = executeSQL(body.sql);
                    sendJSON(res, result, result.success ? 200 : 400);
                    return;
                }
                sendJSON(res, { success: false, error: 'Missing sql field' }, 400);
                return;
            }

            // Database stats
            if (pathname === '/api/stats' && method === 'GET') {
                const stats = database.getStats();
                sendJSON(res, { success: true, stats });
                return;
            }

            sendJSON(res, { success: false, error: 'Not found' }, 404);
            return;
        } catch (error) {
            sendJSON(res, {
                success: false,
                error: error instanceof Error ? error.message : 'Internal error'
            }, 500);
            return;
        }
    }

    // Static files
    if (pathname === '/') {
        serveStatic(res, 'index.html');
        return;
    }

    serveStatic(res, pathname);
}

// Create and start server
const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(err => {
        console.error('Request error:', err);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
    });
});

// Initialize and start
initializeDatabase();

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   LedgerLite Web Demo                                         ║
║   Server running at http://localhost:${String(PORT).padEnd(24)}║
║                                                               ║
║   API Endpoints:                                              ║
║   GET    /api/products      - List all products               ║
║   GET    /api/products/:id  - Get product by ID               ║
║   POST   /api/products      - Create product                  ║
║   PUT    /api/products/:id  - Update product                  ║
║   DELETE /api/products/:id  - Delete product                  ║
║   POST   /api/sql           - Execute raw SQL                 ║
║   GET    /api/stats         - Database statistics             ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);
});

export { server };
