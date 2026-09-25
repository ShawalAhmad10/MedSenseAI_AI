import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import StorefrontLayout from '../layouts/StorefrontLayout';
import ProtectedStorefrontRoute from './ProtectedStorefrontRoute';
import AccountPage from '../pages/storefront/AccountPage';
import CartPage from '../pages/storefront/CartPage';
import CategoryPage from '../pages/storefront/CategoryPage';
import CheckoutPage from '../pages/storefront/CheckoutPage';
import HomePage from '../pages/storefront/HomePage';
import OrderConfirmationPage from '../pages/storefront/OrderConfirmationPage';
import OrdersPage from '../pages/storefront/OrdersPage';
import PharmacistConsultPage from '../pages/storefront/PharmacistConsultPage';
import PrescriptionHistoryPage from '../pages/storefront/PrescriptionHistoryPage';
import PrescriptionUploadPage from '../pages/storefront/PrescriptionUploadPage';
import ProductPage from '../pages/storefront/ProductPage';
import RefundPage from '../pages/storefront/RefundPage';
import RefillAlertsPage from '../pages/storefront/RefillAlertsPage';

export default function StorefrontRoutes() {
  return (
    <Routes>
      <Route element={<StorefrontLayout />}>
        {/* Public Routes - Only landing page is public */}
        <Route element={<HomePage />} index />
        
        {/* Protected Routes - Authentication required for all other pages */}
        <Route element={<ProtectedStorefrontRoute />}>
          <Route element={<CategoryPage />} path="/category/:slug" />
          <Route element={<CategoryPage />} path="/search" />
          <Route element={<ProductPage />} path="/product/:slug" />
          <Route element={<CartPage />} path="/cart" />
          <Route element={<CheckoutPage />} path="/checkout" />
          <Route element={<OrderConfirmationPage />} path="/order-confirmation" />
          <Route element={<PrescriptionUploadPage />} path="/prescription/upload" />
          <Route element={<PrescriptionHistoryPage />} path="/prescription/history" />
          <Route element={<AccountPage />} path="/account" />
          <Route element={<OrdersPage />} path="/orders" />
          <Route element={<PharmacistConsultPage />} path="/consult/pharmacist" />
          <Route element={<RefillAlertsPage />} path="/refills" />
          <Route element={<RefundPage />}      path="/refunds" />
        </Route>
        
        <Route element={<Navigate replace to="/" />} path="*" />
      </Route>
    </Routes>
  );
}
