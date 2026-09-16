// SRS EUC-03 / EUC-05: Product detail page with usage info and suggested alternatives.
import React, { useEffect, useState } from 'react';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import InteractionBadge from '../../components/storefront/InteractionBadge';
import ProductCard from '../../components/storefront/ProductCard';
import QuickViewModal from '../../components/storefront/QuickViewModal';
import { getProductBySlug } from '../../services/storefrontProductService';
import { useCart } from '../../context/CartContext';

const tabs = ['Description', 'Usage', 'Side Effects', 'Interaction Info'];

export default function ProductPage() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('Description');
  const [activeImage, setActiveImage] = useState(0);
  const [quickViewProduct, setQuickViewProduct] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getProductBySlug(slug)
      .then((item) => {
        if (!active) return;
        if (!item) {
          setError('Product not found.');
          return;
        }

        setProduct(item);
        setError('');
        
        // Load alternatives from the item itself
        if (item.alternativeProducts && item.alternativeProducts.length > 0) {
          setAlternatives(item.alternativeProducts);
        }
      })
      .catch(() => {
        if (active) setError('Unable to load this storefront product.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return <div className="storefront-shell"><div className="sf-loading">Loading product detail…</div></div>;
  }

  if (error || !product) {
    return <div className="storefront-shell"><div className="sf-error">{error || 'Unable to load product.'}</div></div>;
  }

  const gallery = [product.imageLabel, `${product.imageLabel} ALT`, `${product.imageLabel} INFO`];
  const tabContent = {
    Description: product.description,
    Usage: product.usage,
    'Side Effects': product.sideEffects,
    'Interaction Info': product.interactions,
  };

  return (
    <div className="storefront-shell">
      <section className="sf-card sf-section-card">
        <div className="sf-detail-layout">
          <div className="sf-gallery-grid">
            <div className="sf-thumbnail-list">
              {gallery.map((entry, index) => (
                <button
                  className={`sf-thumbnail${activeImage === index ? ' active' : ''}`}
                  key={entry}
                  onClick={() => setActiveImage(index)}
                  type="button"
                >
                  <span style={{ display: 'block', padding: '1.1rem 0.5rem', color: 'var(--sf-primary)', fontWeight: 800 }}>
                    {entry}
                  </span>
                </button>
              ))}
            </div>
            <div className="sf-product-visual" style={{ height: 420 }}>
              {gallery[activeImage]}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginBottom: '0.8rem' }}>
              <span className="sf-badge">{product.category}</span>
              <InteractionBadge level={product.warningLevel} />
              {product.requiresPrescription && <span className="sf-badge-warning">Prescription Required</span>}
            </div>
            <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.35rem' }}>{product.name}</h1>
            <p className="sf-muted" style={{ marginTop: 0 }}>{product.subtitle}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1rem' }}>
              <strong style={{ fontSize: '1.65rem' }}>PKR {product.price}</strong>
              <span className="sf-muted" style={{ textDecoration: 'line-through' }}>PKR {product.oldPrice}</span>
              <span className="sf-badge-danger">{product.discountPercent}% OFF</span>
            </div>
            
            {/* Stock Availability Check */}
            {product.stockQty !== undefined && product.stockQty !== null && (
              <div style={{ marginBottom: '1rem' }}>
                {product.stockQty > 0 ? (
                  product.stockQty < 10 ? (
                    <div className="sf-badge-warning" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      ⚠️ Only {product.stockQty} left in stock!
                    </div>
                  ) : (
                    <div className="sf-badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      ✓ In Stock ({product.stockQty} available)
                    </div>
                  )
                ) : (
                  <div className="sf-badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                    ✗ Out of Stock
                  </div>
                )}
              </div>
            )}

            <p className="sf-muted">{product.description}</p>
            <div className="sf-summary-block" style={{ margin: '1rem 0' }}>
              <div className="sf-badge-success" style={{ marginBottom: '0.6rem' }}>
                <ShieldCheck size={14} />
                Genuine product with pharmacist-backed review
              </div>
              <div className="sf-muted" style={{ fontSize: '0.9rem' }}>
                Available strengths: {product.strengths.join(', ')}. Stock note: {product.stockLabel}.
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
              <button 
                className="sf-button" 
                onClick={() => addItem(product)} 
                type="button"
                disabled={!product.stockQty || product.stockQty <= 0}
                style={{
                  opacity: (!product.stockQty || product.stockQty <= 0) ? 0.5 : 1,
                  cursor: (!product.stockQty || product.stockQty <= 0) ? 'not-allowed' : 'pointer'
                }}
              >
                {(!product.stockQty || product.stockQty <= 0) ? 'Out of Stock' : 'Add to Cart'}
              </button>
              <Link 
                className="sf-button-secondary" 
                style={{ 
                  textDecoration: 'none',
                  opacity: (!product.stockQty || product.stockQty <= 0) ? 0.5 : 1,
                  pointerEvents: (!product.stockQty || product.stockQty <= 0) ? 'none' : 'auto'
                }} 
                to="/checkout"
              >
                Buy Now
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="sf-card sf-section-card" style={{ marginTop: '1.2rem' }}>
        <div className="sf-tab-row">
          {tabs.map((tab) => (
            <button
              className={`sf-tab${activeTab === tab ? ' active' : ''}`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="sf-summary-block" style={{ marginTop: '1rem' }}>
          <p className="sf-muted" style={{ margin: 0 }}>
            {tabContent[activeTab]}
          </p>
        </div>
      </section>

      <section className="sf-card sf-section-card" style={{ marginTop: '1.2rem' }}>
        <div className="sf-page-header">
          <div>
            <h2 className="sf-section-heading">Suggested Alternatives</h2>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Mock alternative recommendation logic for safer substitutions and upsell opportunities.
            </p>
          </div>
        </div>
        {alternatives.length === 0 ? (
          <div className="sf-empty">No alternatives are configured for this product yet.</div>
        ) : (
          <div className="sf-carousel">
            {alternatives.map((item) => (
              <ProductCard key={item.id} onQuickView={setQuickViewProduct} product={item} />
            ))}
          </div>
        )}
        <Link className="sf-link" style={{ display: 'inline-flex', alignItems: 'center', marginTop: '1rem' }} to="/search">
          Browse more products <ChevronRight size={14} />
        </Link>
      </section>

      <QuickViewModal isOpen={Boolean(quickViewProduct)} onClose={() => setQuickViewProduct(null)} product={quickViewProduct} />
    </div>
  );
}
