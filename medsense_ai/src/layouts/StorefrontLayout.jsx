import React from 'react';
import { Outlet } from 'react-router-dom';
import Navbar from '../components/storefront/Navbar';
import Footer from '../components/storefront/Footer';
import ChatWidget from '../components/storefront/ChatWidget';

export default function StorefrontLayout() {
  return (
    <div className="storefront-app">
      <Navbar />
      <main className="storefront-main">
        <Outlet />
      </main>
      <Footer />
      <ChatWidget />
    </div>
  );
}
