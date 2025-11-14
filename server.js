/**
 * Shopify Import Server
 * JSON API for Shopify products
 */

import 'dotenv/config';
import express from 'express';
import {
  buildBulkProductsQuery,
  startBulkOperation,
  pollBulkOperationUntilComplete,
  downloadAndAssembleProducts,
} from './shopifyService.js';

const app = express();
app.use(express.json());

let allProducts = [];
let importPromise = null;

async function ensureProductsFresh(force = false) {
  if (!force && allProducts.length > 0) return allProducts;
  if (importPromise) {
    // An import is already in progress; wait for it
    return importPromise;
  }
  const productType = process.env.PRODUCT_TYPE || 'T-Shirts';
  console.log(`Starting bulk import for: ${productType}`);
  const query = buildBulkProductsQuery(productType);
  importPromise = (async () => {
    try {
      const bulkOp = await startBulkOperation(query);
      console.log(`Bulk operation started: ${bulkOp.id}`);
      const completed = await pollBulkOperationUntilComplete();
      if (!completed.url) throw new Error('No result URL from bulk operation');
      const products = await downloadAndAssembleProducts(completed.url);
      allProducts = products;
      console.log(`Imported ${allProducts.length} products`);
      return allProducts;
    } finally {
      importPromise = null;
    }
  })();
  return importPromise;
}

// GET /api/products - Get imported products as JSON (triggers import if empty)
app.get('/api/products', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    await ensureProductsFresh(force);
    res.json({ success: true, count: allProducts.length, products: allProducts });
  } catch (err) {
    console.error('Error serving /api/products:', err.message);
    res.status(500).json({ error: err.message, success: false });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`GET  /api/products       - Get products as JSON`);
  console.log(`POST /api/products/import - Start import\n`);
});
