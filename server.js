/**
 * Shopify Import Server
 * JSON API for Shopify products
 */

import 'dotenv/config';
import express from 'express';
import { ensureProductsFresh } from './library/utils/shopify-helper/get-products-data.js';

const app = express();
app.use(express.json());

// GET /api/products - Get imported products as JSON (triggers import if empty)
app.get('/api/products', async (req, res) => {
  try {
    const force = req.query.refresh === 'true';
    const products = await ensureProductsFresh(force); // this function i have to call in bulkImportProducts.js before mapping the attributes 
    res.json({ success: true, count: products.length, products });
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
