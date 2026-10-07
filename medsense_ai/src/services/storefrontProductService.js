import axios from 'axios';
import { getCategorySlug } from '../constants/categories.js';

const API_URL = '/api/products';

// Collapse only simultaneous requests; no persistent/stale cache.
let productsRequestInFlight = null;
let categoriesRequestInFlight = null;

async function fetchCategoriesDirectory() {
  if (!categoriesRequestInFlight) {
    categoriesRequestInFlight = axios
      .get(`${API_URL}/categories`)
      .finally(() => {
        categoriesRequestInFlight = null;
      });
  }

  return categoriesRequestInFlight;
}

// Delay helper for smooth transitions
const delay = (payload) => Promise.resolve(payload);

// Get all products from database
async function fetchAllProducts() {
  try {
    if (!productsRequestInFlight) {
      productsRequestInFlight = axios
        .get(API_URL, { params: { view: 'storefront' } })
        .then((response) => response.data)
        .finally(() => {
          productsRequestInFlight = null;
        });
    }

    return await productsRequestInFlight;
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

// Transform product from database format to storefront format
function transformProduct(product) {
  const stockQty = product.stockQty || 0;
  const minThreshold = product.minThreshold || 0;
  const isActive = product.status === 'active';
  const hasStock = stockQty > 0;
  
  return {
    id: product.id, // Keep "prod-X" format
    batchId: product.activeBatchId,
    batchNumber: product.activeBatchNumber,
    fifoBatches: product.fifoBatches,
    slug: (product.canonicalTitle || product.title).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    name: product.title,
    subtitle: product.packDescription || `Pack of ${product.packSize || 1}`,
    category: product.category,
    categorySlug: getCategorySlug(product.category),
    price: product.price,
    oldPrice: product.discount > 0 ? Math.round(product.price / (1 - product.discount / 100)) : null,
    discountPercent: product.discount || 0,
    requiresPrescription: product.requiresRx || false,
    inStock: isActive && hasStock,
    stockQty: stockQty, // Pass actual stock quantity
    stockLabel: hasStock
      ? (stockQty <= minThreshold ? 'Limited stock' : 'In stock') 
      : 'Out of stock',
    badge: product.discount > 0 ? `${Math.round(product.discount)}% OFF` : null,
    imageLabel: product.title.substring(0, 4).toUpperCase(),
    description: product.description || `${product.title} - ${product.genericName || 'Quality medicine'}`,
    usage: 'Follow dosage instructions or consult your healthcare provider.',
    sideEffects: 'May cause side effects. Read package insert carefully.',
    interactions: 'Consult pharmacist before combining with other medications.',
    strengths: [product.salt || product.genericName],
    tags: product.discount > 15 ? ['Hot Deal'] : stockQty < minThreshold && stockQty > 0 ? ['Low Stock'] : [],
    warningLevel: product.requiresRx ? 'high' : 'low',
    // Additional fields
    brandName: product.brandName,
    supplierName: product.supplierName,
    genericName: product.genericName,
    salt: product.salt,
    minThreshold: minThreshold,
    expiryDate: product.expiryDate,
  };
}

// Category masters remain visible even before stock or products are added.
export async function getCategories() {
  const [response, products] = await Promise.all([
    fetchCategoriesDirectory(),
    fetchAllProducts(),
  ]);
  const names = response.data?.data?.categories;
  if (!Array.isArray(names)) throw new Error('Unable to load pharmacy categories.');
  const counts = new Map();
  products.forEach(product => {
    if (product.category && (product.status === 'active' || product.stockQty === 0)) {
      counts.set(product.category, (counts.get(product.category) || 0) + 1);
    }
  });
  return delay(names.map(name => ({
    slug: getCategorySlug(name),
    name,
    icon: 'Pill',
    description: '',
    count: counts.get(name) || 0,
  })));
}

// Get featured/top deals products
export async function getTopDeals() {
  const products = await fetchAllProducts();
  
  const transformed = products
    .filter(p => p.status === 'active' && p.stockQty > 0)
    .map(transformProduct)
    .sort((a, b) => b.discountPercent - a.discountPercent)
    .slice(0, 8);
  
  return delay(transformed);
}

// Search products by query and/or category
export async function searchProducts(query = '', categorySlug = '') {
  const products = await fetchAllProducts();
  
  let filtered = products.filter(p => p.status === 'active' || p.stockQty === 0);
  
  // Filter by category
  if (categorySlug) {
    filtered = filtered.filter(p => 
      getCategorySlug(p.category) === categorySlug
    );
  }
  
  // Filter by search query
  if (query) {
    const searchLower = query.toLowerCase();
    filtered = filtered.filter(p => 
      p.title?.toLowerCase().includes(searchLower) ||
      p.genericName?.toLowerCase().includes(searchLower) ||
      p.salt?.toLowerCase().includes(searchLower) ||
      p.category?.toLowerCase().includes(searchLower)
    );
  }
  
  const transformed = filtered.map(transformProduct);
  return delay(transformed);
}

// Get product by slug
export async function getProductBySlug(slug) {
  const products = await fetchAllProducts();
  
  const product = products.find(p => {
    const names = [p.title, p.canonicalTitle, ...(p.batches || []).map(batch => batch.name)].filter(Boolean);
    return names.some(name => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') === slug);
  });
  
  if (!product) {
    throw new Error('Product not found');
  }
  
  const transformed = transformProduct(product);
  
  return delay(transformed);
}

// Get product by ID
export async function getProductById(productId) {
  const products = await fetchAllProducts();
  const product = products.find(p => p.id === productId || p.versionIds?.includes(productId));
  
  if (!product) return null;
  return transformProduct(product);
}
