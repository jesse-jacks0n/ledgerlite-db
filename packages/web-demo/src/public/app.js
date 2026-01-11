/**
 * LedgerLite Web Demo - Frontend Application
 * 
 * Vanilla JavaScript application for managing products.
 * Communicates with the LedgerLite backend API.
 */

const API_BASE = '/api';

// State
let editingProductId = null;

// =============================================================================
// API Functions
// =============================================================================

async function fetchProducts() {
    const response = await fetch(`${API_BASE}/products`);
    return response.json();
}

async function fetchProduct(id) {
    const response = await fetch(`${API_BASE}/products/${id}`);
    return response.json();
}

async function createProduct(data) {
    const response = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return response.json();
}

async function updateProduct(id, data) {
    const response = await fetch(`${API_BASE}/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return response.json();
}

async function deleteProductAPI(id) {
    const response = await fetch(`${API_BASE}/products/${id}`, {
        method: 'DELETE',
    });
    return response.json();
}

async function executeSQLAPI(sql) {
    const response = await fetch(`${API_BASE}/sql`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql }),
    });
    return response.json();
}

async function fetchStats() {
    const response = await fetch(`${API_BASE}/stats`);
    return response.json();
}

// =============================================================================
// UI Functions
// =============================================================================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast visible ${type}`;

    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

function formatPrice(price) {
    return `$${price.toLocaleString()}`;
}

function renderProducts(products) {
    const tbody = document.getElementById('products-body');

    if (!products || products.length === 0) {
        tbody.innerHTML = `
      <tr>
        <td colspan="5" class="loading">No products found. Add one to get started!</td>
      </tr>
    `;
        return;
    }

    tbody.innerHTML = products.map(product => `
    <tr>
      <td><strong>${product.id}</strong></td>
      <td>${escapeHtml(product.name)}</td>
      <td>${formatPrice(product.price)}</td>
      <td>
        <span class="badge ${product.in_stock ? 'badge-success' : 'badge-warning'}">
          ${product.in_stock ? 'Yes' : 'No'}
        </span>
      </td>
      <td class="actions">
        <button class="btn btn-secondary btn-small" onclick="editProduct(${product.id})">
          Edit
        </button>
        <button class="btn btn-danger btn-small" onclick="deleteProduct(${product.id})">
          Delete
        </button>
      </td>
    </tr>
  `).join('');
}

function renderStats(stats) {
    const statsEl = document.getElementById('stats');
    const tables = stats.stats?.tables || {};
    const productCount = tables.products || 0;

    statsEl.innerHTML = `
    <span class="stat-item">Tables: <strong>${stats.stats?.tableCount || 0}</strong></span>
    <span class="stat-item">Products: <strong>${productCount}</strong></span>
  `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// =============================================================================
// Product Management
// =============================================================================

async function loadProducts() {
    try {
        const result = await fetchProducts();
        if (result.success) {
            renderProducts(result.data);
        } else {
            showToast(result.error || 'Failed to load products', 'error');
        }
    } catch (error) {
        showToast('Failed to connect to server', 'error');
    }
}

async function loadStats() {
    try {
        const result = await fetchStats();
        if (result.success) {
            renderStats(result);
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

function showCreateModal() {
    editingProductId = null;
    document.getElementById('modal-title').textContent = 'Add Product';
    document.getElementById('product-form').reset();
    document.getElementById('product-id').disabled = false;
    document.getElementById('product-stock').checked = true;
    document.getElementById('modal').classList.add('visible');
}

async function editProduct(id) {
    try {
        const result = await fetchProduct(id);
        if (result.success) {
            editingProductId = id;
            document.getElementById('modal-title').textContent = 'Edit Product';
            document.getElementById('product-id').value = result.data.id;
            document.getElementById('product-id').disabled = true;
            document.getElementById('product-name').value = result.data.name;
            document.getElementById('product-price').value = result.data.price;
            document.getElementById('product-stock').checked = result.data.in_stock;
            document.getElementById('modal').classList.add('visible');
        } else {
            showToast(result.error || 'Failed to load product', 'error');
        }
    } catch (error) {
        showToast('Failed to load product', 'error');
    }
}

async function saveProduct(event) {
    event.preventDefault();

    const data = {
        id: parseInt(document.getElementById('product-id').value),
        name: document.getElementById('product-name').value,
        price: parseInt(document.getElementById('product-price').value),
        in_stock: document.getElementById('product-stock').checked,
    };

    try {
        let result;
        if (editingProductId !== null) {
            result = await updateProduct(editingProductId, data);
        } else {
            result = await createProduct(data);
        }

        if (result.success) {
            showToast(editingProductId ? 'Product updated!' : 'Product created!');
            closeModal();
            loadProducts();
            loadStats();
        } else {
            showToast(result.error || 'Operation failed', 'error');
        }
    } catch (error) {
        showToast('Failed to save product', 'error');
    }
}

async function deleteProduct(id) {
    if (!confirm('Are you sure you want to delete this product?')) {
        return;
    }

    try {
        const result = await deleteProductAPI(id);
        if (result.success) {
            showToast('Product deleted!');
            loadProducts();
            loadStats();
        } else {
            showToast(result.error || 'Failed to delete', 'error');
        }
    } catch (error) {
        showToast('Failed to delete product', 'error');
    }
}

function closeModal() {
    document.getElementById('modal').classList.remove('visible');
    editingProductId = null;
}

function closeModalOnBackdrop(event) {
    if (event.target.id === 'modal') {
        closeModal();
    }
}

// =============================================================================
// SQL Console
// =============================================================================

async function executeSQL() {
    const input = document.getElementById('sql-input');
    const output = document.getElementById('sql-output');
    const sql = input.value.trim();

    if (!sql) {
        showToast('Please enter a SQL query', 'error');
        return;
    }

    try {
        const result = await executeSQLAPI(sql);
        output.classList.add('visible');

        if (result.success) {
            output.classList.remove('error');
            output.classList.add('success');

            if (result.result?.rows && result.result.rows.length > 0) {
                // Format table output
                const rows = result.result.rows;
                const columns = result.result.columns || Object.keys(rows[0]);

                let table = columns.join(' | ') + '\n';
                table += columns.map(() => '---').join(' | ') + '\n';

                for (const row of rows) {
                    table += columns.map(col => formatValue(row[col])).join(' | ') + '\n';
                }

                output.textContent = `✓ Query executed successfully\n${result.result.rowCount} row(s) returned\n\n${table}`;
            } else if (result.result?.message) {
                output.textContent = `✓ ${result.result.message}`;
            } else {
                output.textContent = '✓ Query executed successfully';
            }

            // Refresh products list if data might have changed
            loadProducts();
            loadStats();
        } else {
            output.classList.remove('success');
            output.classList.add('error');
            output.textContent = `✗ Error: ${result.error}`;
        }
    } catch (error) {
        output.classList.add('visible', 'error');
        output.classList.remove('success');
        output.textContent = `✗ Failed to execute query: ${error.message}`;
    }
}

function formatValue(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
}

function clearConsole() {
    document.getElementById('sql-input').value = '';
    document.getElementById('sql-output').classList.remove('visible');
}

// =============================================================================
// Keyboard Shortcuts
// =============================================================================

document.addEventListener('keydown', (event) => {
    // Escape to close modal
    if (event.key === 'Escape') {
        closeModal();
    }

    // Ctrl+Enter to execute SQL
    if (event.ctrlKey && event.key === 'Enter') {
        if (document.activeElement.id === 'sql-input') {
            executeSQL();
        }
    }
});

// =============================================================================
// Initialization
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadProducts();
    loadStats();

    // Refresh data every 30 seconds
    setInterval(() => {
        loadProducts();
        loadStats();
    }, 30000);
});
