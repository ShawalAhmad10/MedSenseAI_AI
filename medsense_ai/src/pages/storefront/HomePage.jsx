// SRS EUC-03: Public storefront landing page for browsing and shopping medicines.
import React, { useEffect, useState } from 'react';
import { useLiveDataRefresh } from '../../hooks/useLiveDataRefresh';
import {
  Baby,
  BadgeCheck,
  BellRing,
  ChevronRight,
  HeartPulse,
  Microscope,
  Pill,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Stethoscope,
  Truck,
  Wind,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProductCard from '../../components/storefront/ProductCard';
import QuickViewModal from '../../components/storefront/QuickViewModal';
import {
  blogPosts,
  curatedCollections,
  heroStats,
  services,
  shoppingSteps,
  trustBadges,
  trustHighlights,
} from '../../services/storefrontData';
import { getTopDeals, getCategories } from '../../services/storefrontProductService';

const iconMap = {
  BadgeCheck,
  Baby,
  BellRing,
  HeartPulse,
  Microscope,
  Pill,
  ShieldCheck,
  ShieldPlus,
  Sparkles,
  Stethoscope,
  Truck,
  Wind,
};

export default function HomePage() {
  const location = useLocation();
  const { openAuthModal } = useAuth();
  const [deals, setDeals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quickViewProduct, setQuickViewProduct] = useState(null);
  useLiveDataRefresh(async () => {
    const [dealsData, categoriesData] = await Promise.all([getTopDeals(), getCategories()]);
    setDeals(dealsData);
    setCategories(categoriesData);
    setError('');
  }, !loading);

  // Open auth modal if redirected from protected route
  useEffect(() => {
    if (location.state?.requiresAuth) {
      openAuthModal('account');
      // Clear the state to prevent modal from opening again on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state, openAuthModal]);

  useEffect(() => {
    let active = true;

    Promise.all([
      getTopDeals(),
      getCategories()
    ])
      .then(([dealsData, categoriesData]) => {
        if (!active) return;
        setDeals(dealsData);
        setCategories(categoriesData);
        setError('');
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load storefront deals right now.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="storefront-shell">
      <section className="sf-hero sf-grid-hero">
        <div>
          <span className="sf-badge">MedSenseAI Smart Pharmacy</span>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(2.5rem, 5vw, 4.4rem)', lineHeight: 1.02, margin: '1rem 0 0.85rem' }}>
            Smart pharmacy shopping with DDI-aware checkout and prescription OCR.
          </h1>
          <p className="sf-section-subcopy" style={{ fontSize: '1.05rem', maxWidth: 650 }}>
            Browse the pharmacy catalogue, review medicines, upload prescriptions, and complete the governed checkout workflow.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', margin: '1.4rem 0' }}>
            <Link className="sf-button" to="/search">
              Shop Medicines
            </Link>
            <Link className="sf-button-secondary" to="/prescription/upload">
              Upload Prescription
            </Link>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem' }}>
            {trustHighlights.map((item) => {
              const Icon = iconMap[item.icon];
              return (
                <span className="sf-badge" key={item.title}>
                  <Icon size={14} />
                  {item.title}
                </span>
              );
            })}
          </div>
        </div>

        <div className="sf-hero-visual">
          <div className="sf-hero-stack">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.8rem' }}>
              {heroStats.map((stat) => (
                <div className="sf-hero-visual-card" key={stat.label}>
                  <strong style={{ display: 'block', fontSize: '1.35rem', fontFamily: 'var(--font-display)' }}>{stat.value}</strong>
                  <span className="sf-muted" style={{ fontSize: '0.82rem' }}>
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="sf-hero-visual-card">
              <div className="sf-badge-danger" style={{ marginBottom: '0.75rem', width: 'fit-content' }}>
                Live catalogue and current availability
              </div>
              <strong style={{ display: 'block', fontSize: '1.3rem', marginBottom: '0.35rem' }}>
                Integrated pharmacy shopping
              </strong>
              <p className="sf-muted" style={{ marginBottom: 0 }}>
                Catalogue browsing, prescription OCR, cart interaction checks, and pharmacist review remain connected in one application flow.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sf-card sf-section-card" style={{ marginTop: '1.2rem' }}>
        <div className="sf-trust-row">
          {trustHighlights.map((item) => {
            const Icon = iconMap[item.icon];
            return (
              <div className="sf-trust-item" key={item.title}>
                <span className="sf-icon-button">
                  <Icon size={18} />
                </span>
                <span>
                  <strong style={{ display: 'block' }}>{item.title}</strong>
                  <span className="sf-muted" style={{ fontSize: '0.82rem' }}>
                    {item.detail}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="sf-card sf-section-card" style={{ marginTop: '1.2rem' }}>
        <div className="sf-page-header">
          <div>
            <h2 className="sf-section-heading">Shop by Category</h2>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Browse medicine categories from the current pharmacy catalogue.
            </p>
          </div>
          <Link className="sf-link" to="/search">
            View all
          </Link>
        </div>
        <div className="sf-circle-tile-grid">
          {categories.slice(0, 5).map((category) => {
            const Icon = iconMap[category.icon];
            return (
              <Link className="sf-circle-tile" key={category.slug} to={`/category/${category.slug}`}>
                <span className="sf-circle-tile-icon">
                  <Icon size={30} />
                </span>
                <strong style={{ display: 'block', marginBottom: '0.35rem' }}>{category.name}</strong>
                <span className="sf-muted" style={{ fontSize: '0.84rem' }}>
                  {category.description}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="sf-card sf-section-card" style={{ marginTop: '1.2rem' }}>
        <div className="sf-page-header">
          <div>
            <h2 className="sf-section-heading">Top Deals</h2>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Current discounted medicines loaded from the pharmacy catalogue.
            </p>
          </div>
          <Link className="sf-link" to="/search?sort=discount">
            See all deals
          </Link>
        </div>
        {loading ? (
          <div className="sf-loading">Loading current medicine deals...</div>
        ) : error ? (
          <div className="sf-error">{error}</div>
        ) : (
          <div className="sf-carousel">
            {deals.map((product) => (
              <ProductCard key={product.id} onQuickView={setQuickViewProduct} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="sf-card sf-section-card sf-section-soft" style={{ marginTop: '1.2rem' }}>
        <div className="sf-page-header">
          <div>
            <h2 className="sf-section-heading">How shopping stays simple</h2>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              A clearer flow for quick medicine buying, without overloading the page.
            </p>
          </div>
        </div>
        <div className="sf-feature-steps">
          {shoppingSteps.map((step) => (
            <article className="sf-feature-step" key={step.title}>
              <span className="sf-badge">{step.eyebrow}</span>
              <strong>{step.title}</strong>
              <p className="sf-muted" style={{ marginBottom: 0 }}>
                {step.detail}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="sf-card sf-section-card"
        style={{
          marginTop: '1.2rem',
          background: 'linear-gradient(135deg, var(--sf-secondary), var(--sf-primary))',
          color: 'white',
        }}
      >
        <div className="sf-grid-2" style={{ alignItems: 'center' }}>
          <div>
            <span className="sf-badge" style={{ background: 'rgba(255,255,255,0.16)', color: 'white' }}>
              Prescription verification
            </span>
            <h2 className="sf-section-heading" style={{ marginTop: '0.9rem', color: 'white' }}>
              Upload prescriptions once, then review editable OCR results before checkout.
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.76)', lineHeight: 1.8 }}>
              Uploaded prescription images are processed through the OCR workflow and reviewed before confirmation.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Link className="sf-button-secondary" style={{ textDecoration: 'none' }} to="/prescription/upload">
              Upload Now
            </Link>
          </div>
        </div>
      </section>

      <section className="sf-card sf-section-card" style={{ marginTop: '1.2rem' }}>
        <div className="sf-page-header">
          <div>
            <h2 className="sf-section-heading">Quick actions</h2>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Open the catalogue, prescription OCR, or refill workflow directly.
            </p>
          </div>
        </div>
        <div className="sf-editorial-grid">
          {curatedCollections.map((collection) => (
            <article className="sf-editorial-card" key={collection.title}>
              <span className="sf-badge-success">{collection.stats}</span>
              <strong>{collection.title}</strong>
              <p className="sf-muted">{collection.description}</p>
              <Link className="sf-link" to={collection.href}>
                {collection.cta} <ChevronRight size={14} style={{ verticalAlign: 'text-bottom' }} />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="sf-card sf-section-card" style={{ marginTop: '1.2rem' }}>
        <div className="sf-page-header">
          <div>
            <h2 className="sf-section-heading">Services and Smart Care</h2>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Operational workflows available in the current MedSenseAI application.
            </p>
          </div>
        </div>
        <div className="sf-services-grid">
          {services.map((service) => {
            const Icon = iconMap[service.icon];
            return (
              <div className="sf-service-card" key={service.title}>
                <span className="sf-icon-button">
                  <Icon size={18} />
                </span>
                <strong style={{ display: 'block', marginTop: '0.9rem', marginBottom: '0.45rem' }}>{service.title}</strong>
                <p className="sf-muted" style={{ fontSize: '0.9rem' }}>
                  {service.blurb}
                </p>
                <Link className="sf-link" to={service.href}>
                  Learn more <ChevronRight size={14} style={{ verticalAlign: 'text-bottom' }} />
                </Link>
              </div>
            );
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', marginTop: '1.1rem' }}>
          {trustBadges.map((badge) => (
            <span className="sf-badge" key={badge}>
              {badge}
            </span>
          ))}
        </div>
      </section>

      <section className="sf-card sf-section-card" style={{ marginTop: '1.2rem' }}>
        <div className="sf-page-header">
          <div>
            <h2 className="sf-section-heading">Using MedSenseAI</h2>
            <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
              Short guidance for prescription, interaction-check, and refill workflows.
            </p>
          </div>
          <Link className="sf-link" to="/account">
            Manage account
          </Link>
        </div>
        <div className="sf-blog-grid">
          {blogPosts.map((post) => (
            <article className="sf-blog-card" key={post.slug}>
              <span className="sf-badge">{post.category}</span>
              <strong>{post.title}</strong>
              <p className="sf-muted">{post.excerpt}</p>
              <div className="sf-blog-meta">
                <span>{post.publishedAt}</span>
                <span>{post.readTime}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <QuickViewModal isOpen={Boolean(quickViewProduct)} onClose={() => setQuickViewProduct(null)} product={quickViewProduct} />
    </div>
  );
}
