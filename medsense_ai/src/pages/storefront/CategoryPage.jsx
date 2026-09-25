// SRS EUC-03: Category and search results browsing page for storefront users.
import React, { useEffect, useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ProductCard from '../../components/storefront/ProductCard';
import QuickViewModal from '../../components/storefront/QuickViewModal';
import { getCategories, searchProducts } from '../../services/storefrontProductService';

const sortOptions = [
  { value: 'featured', label: 'Featured' },
  { value: 'discount', label: 'Highest Discount' },
  { value: 'priceLow', label: 'Price: Low to High' },
  { value: 'priceHigh', label: 'Price: High to Low' },
];

export default function CategoryPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  const query = params.get('q') || '';
  const sort = params.get('sort') || 'featured';
  const currentSlug = slug || 'all';

  // Load categories once
  useEffect(() => {
    getCategories().then(setCategories).catch(console.error);
  }, []);

  const pageTitle = useMemo(() => {
    if (query) return `Search results for "${query}"`;
    const category = categories.find((entry) => entry.slug === currentSlug);
    return category ? category.name : 'All Products';
  }, [currentSlug, query, categories]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    searchProducts(query, currentSlug === 'all' ? '' : currentSlug)
      .then((items) => {
        if (!active) return;
        
        // Apply sorting
        let sorted = [...items];
        if (sort === 'discount') {
          sorted.sort((a, b) => b.discountPercent - a.discountPercent);
        } else if (sort === 'priceLow') {
          sorted.sort((a, b) => a.price - b.price);
        } else if (sort === 'priceHigh') {
          sorted.sort((a, b) => b.price - a.price);
        }
        
        setProducts(sorted);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load storefront products right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [currentSlug, query, sort]);

  return (
    <div className="storefront-shell">
      <div className="sf-filter-layout">
        <aside className="sf-card sf-section-card" style={{ height: 'fit-content' }}>
          <div className="sf-page-header" style={{ marginBottom: '0.9rem' }}>
            <div>
              <h2 className="sf-section-heading">Filters</h2>
            </div>
            <SlidersHorizontal size={18} />
          </div>
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            <strong>Categories</strong>
            {['all', ...categories.map((category) => category.slug)].map((entry) => (
              <button
                className="sf-button-ghost"
                key={entry}
                onClick={() => {
                    const next = new URLSearchParams(params);
                    if (query) next.set('q', query);
                    next.set('sort', sort);
                    setParams(next);
                    navigate(entry === 'all' ? `/search?${next.toString()}` : `/category/${entry}?${next.toString()}`);
                }}
                style={{
                  justifyContent: 'flex-start',
                  background: currentSlug === entry ? 'var(--sf-primary-soft)' : 'transparent',
                  color: currentSlug === entry ? 'var(--sf-primary)' : 'var(--sf-text)',
                }}
                type="button"
              >
                {entry === 'all' ? 'All categories' : categories.find((item) => item.slug === entry)?.name}
              </button>
            ))}
            <div style={{ marginTop: '1rem' }} />
            <strong>Storefront notes</strong>
            <span className="sf-muted" style={{ fontSize: '0.88rem' }}>
              Real filters like brands, availability, and prescription-only flags can plug into this panel later.
            </span>
          </div>
        </aside>

        <section>
          <div className="sf-card sf-section-card">
            <div className="sf-page-header">
              <div>
                <h1>{pageTitle}</h1>
                <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
                  {query ? 'Public search results with guest-first browsing.' : 'Category listing using the shared product card system.'}
                </p>
              </div>
              <div style={{ minWidth: 220 }}>
                <label className="sf-muted" htmlFor="sort-products" style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.35rem' }}>
                  Sort by
                </label>
                <select
                  className="sf-select"
                  id="sort-products"
                  onChange={(event) => {
                    const next = new URLSearchParams(params);
                    next.set('sort', event.target.value);
                    setParams(next);
                  }}
                  value={sort}
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="sf-loading">Loading products…</div>
            ) : error ? (
              <div className="sf-error">{error}</div>
            ) : products.length === 0 ? (
              <div className="sf-empty">No products matched this category or search. Try a broader keyword.</div>
            ) : (
              <div className="sf-product-grid">
                {products.map((product) => (
                  <ProductCard key={product.id} onQuickView={setQuickViewProduct} product={product} />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      <QuickViewModal isOpen={Boolean(quickViewProduct)} onClose={() => setQuickViewProduct(null)} product={quickViewProduct} />
    </div>
  );
}
