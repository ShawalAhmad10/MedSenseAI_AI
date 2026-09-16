import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './index.css'
import './styles/storefront.css'

// Contexts
import { CartProvider } from './context/CartContext'
import { AuthProvider } from './context/AuthContext'

// Storefront
import StorefrontRoutes from './routes/StorefrontRoutes'

// Pharmacist Auth
import AuthLayout from './layouts/AuthLayout'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPassword from './pages/auth/ForgotPassword'
import PendingApproval from './pages/auth/PendingApproval'
import ProtectedRoute from './routes/ProtectedRoute'

// Pharmacist Portal
import DashboardLayout from './layouts/DashboardLayout'
import Dashboard from './pages/dashboard/Dashboard'
import PrescriptionReview from './pages/dashboard/PrescriptionReview'
import Inventory from './pages/dashboard/Inventory'
import Customers from './pages/dashboard/Customers'
import RecordPayment from './pages/dashboard/RecordPayment'
// Doctors, Expenses, Backups pages removed from dashboard
import Orders from './pages/dashboard/Orders'
import LeadScoring from './pages/dashboard/LeadScoring'
import SalesOptimization from './pages/dashboard/SalesOptimization'
import Analytics from './pages/dashboard/Analytics'
import AIAssistant from './pages/dashboard/AIAssistant'
import Consultations from './pages/dashboard/Consultations'
import InteractionAlerts from './pages/dashboard/InteractionAlerts'
import Settings from './pages/dashboard/Settings'
import BrandManagement from './pages/dashboard/BrandManagement'
import ProductManagement from './pages/dashboard/ProductManagement'
import SupplierManagement from './pages/dashboard/SupplierManagement'

function LegacyDashboardRedirect() {
  const location = useLocation();
  return <Navigate to={location.pathname.replace('/dashboard', '/pharmacist/dashboard')} replace />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId="85915963156-t5r9pn468jdmqdkomjhtv0at04t873kg.apps.googleusercontent.com">
      <AuthProvider>
        <CartProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Navigate to="/pharmacist/login" replace />} />
              <Route path="/register" element={<Navigate to="/pharmacist/register" replace />} />
              <Route path="/forgot-password" element={<Navigate to="/pharmacist/forgot-password" replace />} />
              <Route path="/pending-approval" element={<Navigate to="/pharmacist/pending-approval" replace />} />
              <Route path="/dashboard" element={<Navigate to="/pharmacist/dashboard" replace />} />
              <Route path="/dashboard/*" element={<LegacyDashboardRedirect />} />
              <Route path="/pharmacist" element={<Navigate to="/pharmacist/login" replace />} />
              <Route path="/*" element={<StorefrontRoutes />} />

                {/* Pharmacist Auth */}
                <Route element={<AuthLayout />}>
                  <Route path="/pharmacist/login" element={<LoginPage />} />
                  <Route path="/pharmacist/register" element={<RegisterPage />} />
                  <Route path="/pharmacist/forgot-password" element={<ForgotPassword />} />
                  <Route path="/pharmacist/pending-approval" element={<PendingApproval />} />
                </Route>

                {/* Pharmacist Dashboard */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/pharmacist/dashboard" element={<DashboardLayout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="prescriptions" element={<PrescriptionReview />} />
                    <Route path="inventory" element={<Inventory />} />
                    <Route path="customers" element={<Customers />} />
                    <Route path="record-payment" element={<RecordPayment />} />
                    {/* Doctors, Expenses, Backups routes removed */}
                    <Route path="orders" element={<Orders />} />
                    <Route path="alerts" element={<InteractionAlerts />} />
                    <Route path="ai-assistant" element={<AIAssistant />} />
                    <Route path="leads" element={<LeadScoring />} />
                    <Route path="sales" element={<SalesOptimization />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="consultations" element={<Consultations />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="brands" element={<BrandManagement />} />
                    <Route path="products" element={<ProductManagement />} />
                    <Route path="suppliers" element={<SupplierManagement />} />
                  </Route>
                </Route>
              </Routes>
            </BrowserRouter>
          </CartProvider>
        </AuthProvider>
    </GoogleOAuthProvider>
  </React.StrictMode>,
)
