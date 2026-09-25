import axios from 'axios';

const API_URL = '/api/products';

// Delay helper for smooth transitions
const delay = (payload, timeout = 150) =>
  new Promise((resolve) => {
    setTimeout(() => resolve(payload), timeout);
  });

// Get all products from database
async function fetchAllProducts() {
  try {
    const response = await axios.get(API_URL);
    return response.data;
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
    slug: product.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    name: product.title,
    subtitle: product.packDescription || `Pack of ${product.packSize || 1}`,
    category: product.category,
    categorySlug: product.category.toLowerCase().replace(/\s+/g, '-'),
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

// Get dynamic categories from products
export async function getCategories() {
  const products = await fetchAllProducts();
  
  // Extract unique categories
  const categorySet = new Set();
  const categoryMap = {};
  
  products.forEach(product => {
    if (product.category && product.status === 'active') {
      categorySet.add(product.category);
      if (!categoryMap[product.category]) {
        categoryMap[product.category] = {
          slug: product.category.toLowerCase().replace(/\s+/g, '-'),
          name: product.category,
          icon: 'Pill', // Default icon
          description: `Browse ${product.category.toLowerCase()} products`,
          count: 0
        };
      }
      categoryMap[product.category].count++;
    }
  });
  
  return delay(Object.values(categoryMap));
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
  
  let filtered = products.filter(p => p.status === 'active');
  
  // Filter by category
  if (categorySlug) {
    const category = categorySlug.replace(/-/g, ' ');
    filtered = filtered.filter(p => 
      p.category?.toLowerCase() === category.toLowerCase()
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
    const productSlug = p.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    return productSlug === slug && p.status === 'active';
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
  const product = products.find(p => p.id === productId && p.status === 'active');
  
  if (!product) return null;
  return transformProduct(product);
}
