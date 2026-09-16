// SRS EUC-03 / SD-04 / EUC-04 alt-flow: cart browsing, order prep, and quiet safe-interaction confirmation.
import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import InteractionBadge from './InteractionBadge';

export default function CartDrawer({ isOpen, onClose }) {
  const {
    items,
    prescriptionItems,
    removeItem,
    subtotal,
    updateQuantity,
    ddiLoading,
    ddiCheckoutAllowed,
    ddiWarnings,
  } = useCart();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="sf-overlay"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            animate={{ x: 0 }}
            className="sf-sidepanel"
            exit={{ x: '100%' }}
            initial={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
          >
            <div className="sf-panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1.12rem' }}>Your Cart</strong>
                <span className="sf-muted" style={{ fontSize: '0.84rem' }}>
                  Guest cart saved locally
                </span>
              </div>
              <button className="sf-icon-button" onClick={onClose} type="button">
                <X size={18} />
              </button>
            </div>
            <div className="sf-panel-body">
              {items.length === 0 ? (
                <div className="sf-empty">Your cart is empty. Add a few medicines or wellness products to get started.</div>
              ) : (
                <div style={{ display: 'grid', gap: '0.9rem' }}>
                  {items.map((item) => (
                    <article className="sf-summary-block" key={item.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                        <div>
                          <strong style={{ display: 'block' }}>{item.name}</strong>
                          <span className="sf-muted" style={{ fontSize: '0.84rem' }}>
                            {item.subtitle}
                          </span>
                        </div>
                        <button className="sf-button-ghost" onClick={() => removeItem(item.id)} type="button">
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginTop: '0.9rem' }}>
                        <strong>PKR {item.price * item.quantity}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <button className="sf-icon-button" onClick={() => updateQuantity(item.id, item.quantity - 1)} type="button">
                            <Minus size={15} />
                          </button>
                          <span style={{ minWidth: 18, textAlign: 'center' }}>{item.quantity}</span>
                          <button className="sf-icon-button" onClick={() => updateQuantity(item.id, item.quantity + 1)} type="button">
                            <Plus size={15} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="sf-panel-footer">
              {prescriptionItems.length > 0 && (
                <div style={{ marginBottom: '0.8rem' }}>
                  <InteractionBadge level="moderate" text={`${prescriptionItems.length} item(s) need prescription review`} />
                </div>
              )}
              {items.length > 0 && (
                <div style={{ marginBottom: '0.8rem' }}>
                  <InteractionBadge
                    level={ddiLoading ? 'moderate' : ddiCheckoutAllowed ? 'low' : 'moderate'}
                    text={
                      ddiLoading
                        ? 'Checking drug interactions...'
                        : ddiCheckoutAllowed
                          ? 'DDI review completed - no governed warning found'
                          : `Interaction review required${ddiWarnings.length ? ` (${ddiWarnings.length})` : ''}`
                    }
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.9rem', fontWeight: 700 }}>
                <span>Subtotal</span>
                <span>PKR {subtotal}</span>
              </div>
              <div style={{ display: 'grid', gap: '0.65rem' }}>
                <Link
                  className={ddiCheckoutAllowed ? 'sf-button' : 'sf-button-secondary'}
                  onClick={(event) => {
                    if (!ddiCheckoutAllowed) {
                      event.preventDefault();
                      return;
                    }
                    onClose();
                  }}
                  style={{ textAlign: 'center', textDecoration: 'none' }}
                  to="/checkout"
                >
                  Proceed to Checkout
                </Link>
                <Link className="sf-button-secondary" onClick={onClose} style={{ textAlign: 'center', textDecoration: 'none' }} to="/cart">
                  View Full Cart
                </Link>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
