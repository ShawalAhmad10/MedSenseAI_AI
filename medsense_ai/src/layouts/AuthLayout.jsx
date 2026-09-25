// src/layouts/AuthLayout.jsx
import React from 'react'
import { Outlet } from 'react-router-dom'
import '../index.css' // Import the global/auth styles
import ToastContainer from '../components/common/ToastContainer'

export default function AuthLayout() {
  return (
    <div style={{ minHeight: '100vh', fontFamily: 'var(--font-body)' }}>
      <Outlet />
      <ToastContainer />
    </div>
  )
}
