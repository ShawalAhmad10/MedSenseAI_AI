// SRS SD-04: Storefront order confirmation after checkout completion.
import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function OrderConfirmationPage() {
  const location = useLocation();
  const { orderNumber, total } = location.state || {};

  return (
    <div className="storefront-shell">
      <div className="sf-card sf-section-card" style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto' }}>
        <CheckCircle2 color="var(--sf-success)" size={56} />
        <h1 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.5rem' }}>Order confirmed</h1>
        <p className="sf-muted" style={{ maxWidth: 520, margin: '0 auto 1.25rem' }}>
          Your order has been placed successfully. {orderNumber && `Order #${orderNumber}`} {total && `• Total: PKR ${total}`}
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="sf-button" style={{ textDecoration: 'none' }} to="/orders">View Orders</Link>
          <Link className="sf-button-secondary" style={{ textDecoration: 'none' }} to="/">Continue Shopping</Link>
        </div>
      </div>
    </div>
  );
}
