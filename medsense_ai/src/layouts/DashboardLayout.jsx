// src/layouts/DashboardLayout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import ContextPanel from '../components/layout/ContextPanel';
import { useWindowSize } from '../hooks/useWindowSize';
import { useBackendStatus } from '../hooks/useBackendStatus';
import ToastContainer from '../components/common/ToastContainer';

export default function DashboardLayout() {
  const { isOnline, isChecking } = useBackendStatus();

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        background: 'var(--dash-bg)',
        overflow: 'hidden',
        flexDirection: 'column',
      }}
    >
      {/* ── Backend Offline Banner ── */}
      {!isChecking && !isOnline && (
        <div style={{
          background: '#dc2626',
          color: 'white',
          padding: '0.5rem 1.5rem',
          fontSize: '0.82rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 9999,
          flexShrink: 0,
        }}>
          <span>⚠️</span>
          <span>
            Backend server is not running. Data will not be saved.
            Start it with: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
              cd backend &amp;&amp; npm run dev
            </code>
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: Sidebar */}
        <Sidebar />

        {/* Right: TopBar + Page content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <TopBar />
          <main
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '1.25rem 1.5rem',
            }}
          >
            <Outlet />
          </main>
        </div>

        {/* Right: Context Panel (Visible on Desktop) */}
        <ContextPanelWrapper />
      </div>
      {/* Global Toast Notifications */}
      <ToastContainer />
    </div>
  );
}

function ContextPanelWrapper() {
  const { width } = useWindowSize();
  const isDesktop = width >= 1200;
  if (!isDesktop) return null;
  return <ContextPanel />;
}
