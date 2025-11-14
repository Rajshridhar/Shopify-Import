/**
 * Shopify GraphQL Bulk Import Service
 */

import 'dotenv/config';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

const SHOP = process.env.SHOP;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-10';

if (!SHOP || !ACCESS_TOKEN) {
  throw new Error('Missing SHOP or SHOPIFY_ACCESS_TOKEN environment variables');
}

// GraphQL API call
async function shopifyGraphQL(query) {
  const url = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GraphQL HTTP ${res.status}: ${res.statusText}\n${text}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

// Build bulk import GraphQL query
export function buildBulkProductsQuery(productType) {
  const searchValue = productType.includes(' ') ? `"${productType}"` : productType;
  // Bulk API expects all connections to use edges { node { ... } }
  return `{
    products(query: "product_type:${searchValue}") {
      edges {
        node {
          id
          title
          handle
          productType
          vendor
          tags
          variants {
            edges {
              node {
                id
                sku
                title
                price
                barcode
              }
            }
          }
          images {
            edges {
              node {
                id
                url
                altText
              }
            }
          }
        }
      }
    }
  }`;
}

// Start bulk operation
export async function startBulkOperation(queryStr) {
  const data = await shopifyGraphQL(`
    mutation {
      bulkOperationRunQuery(query: ${JSON.stringify(queryStr)}) {
        bulkOperation {
          id
          status
        }
        userErrors {
          message
        }
      }
    }
  `);
  const result = data.bulkOperationRunQuery;
  if (result.userErrors?.length) {
    throw new Error(`Bulk operation error: ${result.userErrors[0].message}`);
  }
  return result.bulkOperation;
}

// Get current bulk operation status
async function getCurrentBulkOperation() {
  const data = await shopifyGraphQL(`
    query {
      currentBulkOperation {
        id
        status
        url
        completedAt
      }
    }
  `);
  return data.currentBulkOperation;
}

// Poll until bulk operation completes
export async function pollBulkOperationUntilComplete(options = {}) {
  const { intervalMs = 5000, timeoutMs = 30 * 60 * 1000 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const op = await getCurrentBulkOperation();
    if (op.status === 'COMPLETED') {
      return op;
    }
    if (op.status === 'FAILED' || op.status === 'CANCELED') {
      throw new Error(`Bulk operation ${op.status}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('Bulk operation polling timeout');
}

// Download and parse JSONL to JSON array
export async function downloadAndAssembleProducts(url) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download: HTTP ${res.status}`);
  }

  const nodeReadable = Readable.fromWeb(res.body);
  const rl = createInterface({ input: nodeReadable, crlfDelay: Infinity });

  // We'll collect products and attach children (variants/images) using __parentId
  const products = new Map(); // key: productId -> product object
  const pendingChildren = new Map(); // key: productId -> array of children to attach later
  let lineCount = 0;

  const attachChild = (parentId, type, data) => {
    const p = products.get(parentId);
    if (p) {
      if (type === 'variant') p.variants.push(data);
      else if (type === 'image') p.images.push(data);
    } else {
      const arr = pendingChildren.get(parentId) || [];
      arr.push({ type, data });
      pendingChildren.set(parentId, arr);
    }
  };

  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    lineCount++;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      console.warn(`Skipping invalid JSONL line ${lineCount}`);
      continue;
    }

    // Infer type based on fields (Shopify bulk JSONL doesn't include __typename)
    let t;
    if (obj.productType !== undefined || obj.handle !== undefined) {
      t = 'Product';
    } else if (obj.__parentId && obj.sku !== undefined) {
      t = 'ProductVariant';
    } else if (obj.__parentId && obj.url !== undefined && obj.altText !== undefined) {
      t = 'Image';
    } else {
      // Skip unknown types
      continue;
    }

    if (t === 'Product') {
      const product = {
        id: obj.id,
        title: obj.title,
        handle: obj.handle || '',
        productType: obj.productType || '',
        vendor: obj.vendor || '',
        tags: obj.tags || [],
        variants: [],
        images: [],
      };
      products.set(product.id, product);

      // Attach any children that arrived before the product
      const pending = pendingChildren.get(product.id);
      if (pending && pending.length) {
        for (const child of pending) {
          if (child.type === 'variant') product.variants.push(child.data);
          else if (child.type === 'image') product.images.push(child.data);
        }
        pendingChildren.delete(product.id);
      }
    } else if (t === 'ProductVariant') {
      const parentId = obj.__parentId;
      const variant = {
        id: obj.id,
        sku: obj.sku || '',
        title: obj.title || '',
        price: obj.price ?? null,
        barcode: obj.barcode || '',
      };
      attachChild(parentId, 'variant', variant);
    } else if (t === 'Image') {
      const parentId = obj.__parentId;
      const image = {
        id: obj.id,
        url: obj.url,
        altText: obj.altText || '',
      };
      attachChild(parentId, 'image', image);
    }
  }

  // Final pass to attach any children still pending (in case product arrived after)
  for (const [parentId, children] of pendingChildren.entries()) {
    const p = products.get(parentId);
    if (p) {
      for (const child of children) {
        if (child.type === 'variant') p.variants.push(child.data);
        else if (child.type === 'image') p.images.push(child.data);
      }
    }
  }

  const result = Array.from(products.values());
  console.log(`Parsed ${lineCount} lines -> ${result.length} products`);
  return result;
}
