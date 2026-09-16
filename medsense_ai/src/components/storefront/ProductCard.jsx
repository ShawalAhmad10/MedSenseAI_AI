// SRS EUC-03 / EUC-05: Product browsing card with add-to-cart and alternative-shopping support.
import React from 'react';
import { Eye, Plus, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';

export default function ProductCard({ onQuickView, product }) {
  const { addItem } = useCart();
  const isOutOfStock = !product.inStock || product.stockQty === 0;

  return (
    <article className="sf-product-card">
      {product.badge && (
        <span className={product.requiresPrescription ? 'sf-badge-warning' : 'sf-badge-danger'} style={{ position: 'absolute', top: 14, left: 14 }}>
          {product.badge}
        </span>
      )}
      {isOutOfStock && (
        <span className="sf-badge" style={{ position: 'absolute', top: 14, right: 14, background: 'var(--sf-danger)', color: 'white' }}>
          Out of Stock
        </span>
      )}
      <div className="sf-product-visual">{product.imageLabel}</div>
      <strong style={{ display: 'block', fontSize: '1.02rem', minHeight: 48 }}>{product.name}</strong>
      <span className="sf-muted" style={{ display: 'block', fontSize: '0.88rem', marginTop: '0.2rem' }}>
        {product.subtitle}
      </span>
      <p className="sf-muted" style={{ fontSize: '0.88rem', minHeight: 48 }}>
        {product.description}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem', marginTop: '0.9rem' }}>
        <div>
          <strong style={{ display: 'block', fontSize: '1.1rem' }}>PKR {product.price}</strong>
          {product.oldPrice && (
            <span className="sf-muted" style={{ textDecoration: 'line-through', fontSize: '0.84rem' }}>
              PKR {product.oldPrice}
            </span>
          )}
          <span 
            className={isOutOfStock ? 'sf-badge-danger' : product.stockLabel === 'Limited stock' ? 'sf-badge-warning' : 'sf-badge-success'} 
            style={{ display: 'inline-block', marginTop: '0.3rem', fontSize: '0.75rem' }}
          >
            {product.stockLabel || (isOutOfStock ? 'Out of Stock' : 'In Stock')}
          </span>
        </div>
        <button 
          className="sf-icon-button" 
          onClick={() => addItem(product)} 
          type="button"
          disabled={isOutOfStock}
          style={{ opacity: isOutOfStock ? 0.5 : 1, cursor: isOutOfStock ? 'not-allowed' : 'pointer' }}
          title={isOutOfStock ? 'Out of stock' : 'Add to cart'}
        >
          <Plus size={18} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.65rem', marginTop: '1rem' }}>
        <Link className="sf-button-secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none', padding: '0.72rem 0.85rem' }} to={`/product/${product.slug}`}>
          <ShoppingBag size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
          View
        </Link>
        <button className="sf-button-ghost" onClick={() => onQuickView?.(product)} type="button">
          <Eye size={16} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
          Quick View
        </button>
      </div>
    </article>
  );
}
