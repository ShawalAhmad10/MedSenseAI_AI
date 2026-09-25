// SRS EUC-03: Primary storefront navigation, browsing, medicine search, and notification entry point.
import React, { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FlaskConical,
  Menu,
  PackageCheck,
  RotateCcw,
  Search,
  ShoppingCart,
  UserCircle2,
  X,
} from 'lucide-react';
import { getCategories, searchProducts } from '../../services/storefrontProductService';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import AuthModal from './AuthModal';
import CartDrawer from './CartDrawer';
import NotificationBell from './NotificationBell';

export default function Navbar() {
  const navigate = useNavigate();
  const { itemCount, drawerOpen, openDrawer, closeDrawer } = useCart();
  const { user, logout, authModalState, openAuthModal, closeAuthModal } = useAuth();
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [allProducts, setAllProducts] = useState([]);

  // Load categories and products on mount
  useEffect(() => {
    async function loadData() {
      const [cats, prods] = await Promise.all([
        getCategories(),
        searchProducts('', '') // Get all products
      ]);
      setCategories(cats);
      setAllProducts(prods);
    }
    loadData();
  }, []);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    return allProducts
      .filter((product) => product.name.toLowerCase().includes(normalized))
      .slice(0, 4);
  }, [query, allProducts]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) {
      params.set('q', query.trim());
    }
    navigate(`/search?${params.toString()}`);
    setMenuOpen(false);
  };

  const mobileLinks = [
    { to: '/orders',  label: 'Track Order' },
    { to: '/refunds', label: 'Returns & Refunds' },
    { to: '/prescription/upload', label: 'Upload Prescription' },
    { to: '/refills', label: 'Refill Alerts' },
    { to: '/consult/pharmacist', label: 'Consult Status' },
    { to: '/account', label: 'My Account' },
  ];

  return (
    <>
      <header className="sf-navbar">
        <div className="storefront-shell">
          <div className="sf-navbar-top">
            <Link className="sf-brand" to="/">
              <span className="sf-brand-mark">M</span>
              <span>
                <strong style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: '1rem' }}>
                  MedSenseAI
                </strong>
                <span className="sf-muted" style={{ fontSize: '0.78rem' }}>
                  Pharmacy storefront powered by smart care
                </span>
              </span>
            </Link>

            <form className="sf-navbar-search" onSubmit={handleSearchSubmit}>
              <div className="sf-navbar-searchbar">
                <Search color="var(--blue)" size={18} />
                <input
                  aria-label="Search medicines"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search medicines, brands, wellness essentials"
                  value={query}
                />
                <button className="sf-button" style={{ padding: '0.7rem 1rem' }} type="submit">
                  Search
                </button>
              </div>

              {suggestions.length > 0 && (
                <div className="sf-search-suggestions">
                  {suggestions.map((product) => (
                    <Link
                      key={product.id}
                      className="sf-search-suggestion"
                      onClick={() => setQuery('')}
                      to={`/product/${product.slug}`}
                    >
                      <span>
                        <strong style={{ display: 'block' }}>{product.name}</strong>
                        <span className="sf-muted" style={{ fontSize: '0.82rem' }}>
                          {product.subtitle}
                        </span>
                      </span>
                      <span className="sf-badge">{product.category}</span>
                    </Link>
                  ))}
                </div>
              )}
            </form>

            <div className="sf-navbar-actions">
              {user ? (
                <Link className="sf-navbar-actionlink" to="/orders">
                  <PackageCheck size={18} />
                  <span>Track Order</span>
                </Link>
              ) : (
                <button 
                  className="sf-navbar-actionlink" 
                  onClick={() => openAuthModal('account')}
                  type="button"
                  style={{ cursor: 'pointer' }}
                >
                  <PackageCheck size={18} />
                  <span>Track Order</span>
                </button>
              )}
              {user && (
                <Link className="sf-navbar-actionlink" to="/refunds">
                  <RotateCcw size={18} />
                  <span>Returns</span>
                </Link>
              )}
              <NotificationBell />
              {user ? (
                <button className="sf-button-ghost" onClick={logout} type="button">
                  {user.name.split(' ')[0]} | Sign out
                </button>
              ) : (
                <button className="sf-navbar-actionlink" onClick={() => openAuthModal('account')} type="button">
                  <UserCircle2 size={18} />
                  <span>Sign In / Register</span>
                </button>
              )}
              <button
                aria-label="Open cart"
                className="sf-icon-button"
                onClick={openDrawer}
                style={{ position: 'relative' }}
                type="button"
              >
                <ShoppingCart size={18} />
                <span
                  style={{
                    position: 'absolute',
                    top: -5,
                    right: -5,
                    minWidth: 20,
                    height: 20,
                    borderRadius: 999,
                    background: 'var(--sf-danger)',
                    color: 'white',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '0 0.25rem',
                  }}
                >
                  {itemCount}
                </span>
              </button>
              <button
                aria-label="Open menu"
                className="sf-icon-button sf-mobile-menu-toggle"
                onClick={() => setMenuOpen(true)}
                type="button"
              >
                <Menu size={18} />
              </button>
            </div>
          </div>

          <div className="sf-navbar-subnav">
            <nav aria-label="Store categories" className="sf-category-row">
              {categories.map((category) => (
                <NavLink
                  key={category.slug}
                  className={({ isActive }) => `sf-category-pill${isActive ? ' active' : ''}`}
                  to={`/category/${category.slug}`}
                >
                  {category.name}
                </NavLink>
              ))}
              <NavLink className="sf-category-pill" to="/search?sort=discount">
                Top Deals
              </NavLink>
            </nav>
            <span className="sf-offer-pill">
              <FlaskConical size={15} />
              Offers Live
            </span>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              animate={{ opacity: 1 }}
              className="sf-overlay"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.aside
              animate={{ x: 0 }}
              className="sf-sidepanel sf-sidepanel-left"
              exit={{ x: '-100%' }}
              initial={{ x: '-100%' }}
              transition={{ duration: 0.22, type: 'tween' }}
            >
              <div className="sf-panel-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <div>
                  <strong style={{ display: 'block', fontFamily: 'var(--font-display)' }}>Browse Storefront</strong>
                  <span className="sf-muted" style={{ fontSize: '0.82rem' }}>
                    Guest-first shopping with pharmacist support
                  </span>
                </div>
                <button className="sf-icon-button" onClick={() => setMenuOpen(false)} type="button">
                  <X size={18} />
                </button>
              </div>
              <div className="sf-panel-body">
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  {categories.map((category) => (
                    <Link
                      key={category.slug}
                      className="sf-link"
                      onClick={() => setMenuOpen(false)}
                      style={{ padding: '0.85rem 1rem', borderRadius: 16, background: 'var(--sf-surface-alt)' }}
                      to={`/category/${category.slug}`}
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
                
                {user ? (
                  <div style={{ marginTop: '1.25rem', display: 'grid', gap: '0.65rem' }}>
                    {mobileLinks.map((item) => (
                      <Link
                        key={item.to}
                        className="sf-link"
                        onClick={() => setMenuOpen(false)}
                        style={{ padding: '0.25rem 0' }}
                        to={item.to}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--sf-surface-alt)', borderRadius: '12px', textAlign: 'center' }}>
                    <p className="sf-muted" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                      Sign in to track orders and manage your account
                    </p>
                    <button 
                      className="sf-button" 
                      onClick={() => {
                        setMenuOpen(false);
                        openAuthModal('account');
                      }}
                      style={{ width: '100%' }}
                    >
                      Sign In / Register
                    </button>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <CartDrawer isOpen={drawerOpen} onClose={closeDrawer} />
      <AuthModal intent={authModalState.intent} isOpen={authModalState.open} onClose={closeAuthModal} />
    </>
  );
}
