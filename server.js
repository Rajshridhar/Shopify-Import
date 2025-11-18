/**
 * Shopify Import Server
 * JSON API for Shopify products
 */

import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json());

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}\n`);
});
