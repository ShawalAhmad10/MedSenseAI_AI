// SRS EUC-03 / EUC-05: Product detail page with usage info and suggested alternatives.
import React, { useEffect, useState } from 'react';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import BackLink from '../../components/storefront/BackLink';
import { isListingPath, lastStorefrontListing, previousStorefrontLocation } from '../../services/storefrontNavigation';
import InteractionBadge from '../../components/storefront/InteractionBadge';
import ProductCard from '../../components/storefront/ProductCard';
import QuickViewModal from '../../components/storefront/QuickViewModal';
import { getProductBySlug } from '../../services/storefrontProductService';
import { getProductRecommendations } from '../../services/storefrontRecommendationService';
import { trackFunnelEventOnce } from '../../services/storefrontFunnelService';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { startBuyNowCheckout } from '../../services/storefrontCheckoutSession';

const tabs = ['Description', 'Usage', 'Side Effects', 'Interaction Info'];

export default function ProductPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const previousPath = previousStorefrontLocation(location.pathname + location.search + location.hash);
  const backToListing = isListingPath(previousPath) ? previousPath : lastStorefrontListing();
  const { addItem } = useCart();
  const { isAuthenticated, user } = useAuth();
  const [product, setProduct] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('Description');
  const [activeImage, setActiveImage] = useState(0);
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  useLiveDataRefresh(async () => {
    const item = await getProductBySlug(slug);
    setProduct(item || null);
    setError(item ? '' : 'Product not found.');
  }, !loading);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setRecommendation(null);
    setRecommendationError('');
    setRecommendationLoading(false);

    getProductBySlug(slug)
      .then((item) => {
        if (!active) return;
        if (!item) {
          setError('Product not found.');
          return;
        }

        setProduct(item);
        setError('');

        void trackFunnelEventOnce(
          'product_viewed',
          [item.id]
        );
        
        setRecommendationLoading(true);

        void getProductRecommendations(
          item.id
        )
          .then((result) => {
            if (!active) return;

            setRecommendation(
              result
            );

            setRecommendationError('');
          })
          .catch((requestError) => {
            if (!active) return;

            setRecommendation(
              null
            );

            setRecommendationError(
              requestError.message ||
              'Unable to load medicine recommendations.'
            );
          })
          .finally(() => {
            if (active) {
              setRecommendationLoading(
                false
              );
            }
          });
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
    return <div className="storefront-shell"><BackLink to={backToListing}>Back to Products</BackLink><div className="sf-loading">Loading product detail…</div></div>;
  }

  if (error || !product) {
    return <div className="storefront-shell"><BackLink to={backToListing}>Back to Products</BackLink><div className="sf-error">{error || 'Unable to load product.'}</div></div>;
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
      <BackLink to={backToListing} style={{ marginBottom: '1rem' }}>Back to Products</BackLink>
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
              <button
                className="sf-button-secondary"
                disabled={!product.stockQty || product.stockQty <= 0}
                onClick={() => {
                  startBuyNowCheckout(
                    product,
                    isAuthenticated && user?.id
                      ? user.id
                      : null
                  );
                  navigate('/checkout?mode=buy-now', { state: { returnTo: location.pathname + location.search + location.hash } });
                }}
                style={{
                  opacity: (!product.stockQty || product.stockQty <= 0) ? 0.5 : 1,
                  cursor: (!product.stockQty || product.stockQty <= 0) ? 'not-allowed' : 'pointer'
                }}
                type="button"
              >
                Buy Now
              </button>
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
              Catalogue suggestions are limited to the same recorded active ingredient when an active, in-stock option exists.
            </p>
          </div>
        </div>

        {recommendationLoading && (
          <div className="sf-loading">
            Loading same-ingredient catalogue options...
          </div>
        )}

        {!recommendationLoading &&
          recommendationError && (
            <div
              className="sf-badge-warning"
              style={{
                display: 'inline-block',
              }}
            >
              {recommendationError}
            </div>
          )}

        {!recommendationLoading &&
          !recommendationError &&
          recommendation?.status ===
            'SOURCE_IDENTITY_UNAVAILABLE' && (
            <div className="sf-empty">
              This product does not have enough recorded ingredient information to derive catalogue alternatives.
            </div>
          )}

        {!recommendationLoading &&
          !recommendationError &&
          recommendation &&
          recommendation.status !==
            'SOURCE_IDENTITY_UNAVAILABLE' &&
          recommendation.recommendations.length ===
            0 && (
            <div className="sf-empty">
              No same-ingredient active, in-stock alternative is currently available.
            </div>
          )}

        {!recommendationLoading &&
          !recommendationError &&
          recommendation?.recommendations?.length >
            0 && (
            <div className="sf-carousel">
              {recommendation.recommendations.map(
                (item) => (
                  <ProductCard
                    key={item.id}
                    onQuickView={
                      setQuickViewProduct
                    }
                    product={item}
                  />
                )
              )}
            </div>
          )}

        {recommendation?.limitations?.map(
          (note, index) => (
            <p
              className="sf-muted"
              key={`recommendation-limit-${index}`}
              style={{
                fontSize: '0.82rem',
                marginBottom:
                  index ===
                  recommendation.limitations.length - 1
                    ? 0
                    : '0.35rem',
                marginTop: '0.8rem',
              }}
            >
              {note}
            </p>
          )
        )}

        <p
          className="sf-muted"
          style={{
            fontSize: '0.82rem',
            marginBottom: 0,
            marginTop: '0.55rem',
          }}
        >
          Choosing an option does not bypass interaction checking. Cart and checkout safety checks remain authoritative.
        </p>

        <Link
          className="sf-link"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginTop: '1rem',
          }}
          to="/search"
        >
          Browse more products <ChevronRight size={14} />
        </Link>
      </section>

      <QuickViewModal isOpen={Boolean(quickViewProduct)} onClose={() => setQuickViewProduct(null)} product={quickViewProduct} />
    </div>
  );
}
