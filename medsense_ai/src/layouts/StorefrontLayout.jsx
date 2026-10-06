import React, { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { rememberStorefrontLocation } from '../services/storefrontNavigation';
import Navbar from '../components/storefront/Navbar';
import Footer from '../components/storefront/Footer';
export default function StorefrontLayout() {
  const location = useLocation();
  useEffect(() => {
    rememberStorefrontLocation(location.pathname + location.search + location.hash);
  }, [location.pathname, location.search, location.hash]);
  return (
    <div className="storefront-app">
      <Navbar />
      <main className="storefront-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
