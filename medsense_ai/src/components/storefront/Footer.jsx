import React from 'react';
import { Link } from 'react-router-dom';

const footerColumns = [
  {
    title: 'Shop',
    links: [
      { label: 'Analgesic', href: '/category/analgesic' },
      { label: 'Vitamins', href: '/category/vitamins' },
      { label: 'Gastrointestinal', href: '/category/gastrointestinal' },
    ],
  },
  {
    title: 'Support',
    links: [
      { label: 'Track Order', href: '/orders' },
      { label: 'Prescription Upload', href: '/prescription/upload' },
      { label: 'Refill Alerts', href: '/refills' },
      { label: 'Subscriptions', href: '/subscriptions' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Account', href: '/account' },
      { label: 'Privacy', href: '/' },
      { label: 'Secure Checkout', href: '/checkout' },
    ],
  },
];

export default function Footer() {
  return (
    <footer style={{ background: 'var(--sf-secondary)', color: 'white', padding: '3rem 0' }}>
      <div className="storefront-shell" style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr', gap: '2rem' }}>
        <div>
          <strong style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.75rem' }}>
            MedSenseAI Storefront
          </strong>
          <p style={{ color: 'rgba(255,255,255,0.74)', lineHeight: 1.8, maxWidth: 440 }}>
            Public ecommerce experience for browsing, buying, uploading prescriptions, and staying on top of refills while the pharmacist portal stays isolated behind its own route tree.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
          {footerColumns.map((column) => (
            <div key={column.title}>
              <strong style={{ display: 'block', marginBottom: '0.85rem' }}>{column.title}</strong>
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {column.links.map((link) => (
                  <Link key={link.label} style={{ color: 'rgba(255,255,255,0.76)', textDecoration: 'none' }} to={link.href}>
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </footer>
  );
}
