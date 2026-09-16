// Beyond SRS scope: ecommerce quick-view convenience modal for faster storefront browsing.
import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { trackFunnelEventOnce } from '../../services/storefrontFunnelService';
import InteractionBadge from './InteractionBadge';

export default function QuickViewModal({ isOpen, onClose, product }) {
  const { addItem } = useCart();

  useEffect(() => {
    if (!isOpen || !product?.id) {
      return;
    }

    void trackFunnelEventOnce(
      'product_viewed',
      [product.id]
    );
  }, [isOpen, product?.id]);

  return (
    <AnimatePresence>
      {isOpen && product && (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="sf-overlay"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className="sf-modal-shell">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="sf-card sf-modal-card"
              exit={{ opacity: 0, y: 16 }}
              initial={{ opacity: 0, y: 16 }}
              style={{ width: 'min(100%, 780px)', padding: '1.25rem' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <strong style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1.35rem' }}>
                    {product.name}
                  </strong>
                  <span className="sf-muted">{product.subtitle}</span>
                </div>
                <button className="sf-icon-button" onClick={onClose} type="button">
                  <X size={18} />
                </button>
              </div>
              <div className="sf-detail-layout" style={{ marginTop: '1rem' }}>
                <div className="sf-product-visual" style={{ height: 260 }}>
                  {product.imageLabel}
                </div>
                <div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.8rem' }}>
                    <span className="sf-badge">{product.category}</span>
                    <InteractionBadge level={product.warningLevel} />
                  </div>
                  <p className="sf-muted">{product.description}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
                    <strong style={{ fontSize: '1.4rem' }}>PKR {product.price}</strong>
                    <span className="sf-muted" style={{ textDecoration: 'line-through' }}>
                      PKR {product.oldPrice}
                    </span>
                  </div>
                  <div className="sf-summary-block">
                    <strong style={{ display: 'block', marginBottom: '0.35rem' }}>Storefront Notes</strong>
                    <div className="sf-muted" style={{ fontSize: '0.9rem' }}>
                      {product.requiresPrescription
                        ? 'This item can be added to cart, but checkout will require prescription verification.'
                        : 'Available for guest cart with pharmacist-backed support if needed.'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1rem' }}>
                    <button className="sf-button" onClick={() => addItem(product)} type="button">
                      Add to Cart
                    </button>
                    <button className="sf-button-secondary" onClick={onClose} type="button">
                      Keep Browsing
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
