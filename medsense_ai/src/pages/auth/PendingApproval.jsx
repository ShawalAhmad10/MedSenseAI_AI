// src/pages/auth/PendingApproval.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Check, FileSearch, ShieldCheck, Mail, RefreshCw, LogOut } from 'lucide-react';
import Button from '../../components/common/Button';
import { usePharmacistAuth } from '../../hooks/usePharmacistAuth';
import { useToast } from '../../hooks/useToast';
import { authService } from '../../services/authService';

export default function PendingApproval() {
  const { user, logout } = usePharmacistAuth();

  const [isChecking, setIsChecking] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Support Google users who don't have a token yet — email passed via navigate state
  const email =
    user?.email ||
    'your email address';

  const statusToken =
    user?.token || null;

  useEffect(() => {
    if (!statusToken) {
      navigate(
        '/pharmacist/login',
        { replace: true }
      );
      return;
    }

    const interval =
      setInterval(
        async () => {
          try {
            const result =
              await authService
                .checkApprovalStatus(
                  statusToken
                );

            if (
              result?.isApproved
            ) {
              navigate(
                '/pharmacist/dashboard'
              );
            }
          } catch {
            // Polling stays silent.
          }
        },
        30000
      );

    return () =>
      clearInterval(
        interval
      );
  }, [
    navigate,
    statusToken
  ]);

  async function checkStatus() {
    setIsChecking(true);
    try {
      if (!statusToken) {
        navigate(
          '/pharmacist/login',
          { replace: true }
        );
        return;
      }

      const result =
        await authService
          .checkApprovalStatus(
            statusToken
          );

      if (result?.isApproved) {
        navigate('/pharmacist/dashboard');
      } else {
        showToast({ type: 'info', message: "Still under review. We'll email you!" });
      }
    } catch (e) {
      showToast({ type: 'info', message: "Still under review. We'll email you!" });
    } finally {
      setIsChecking(false);
    }
  }

  const checklistItems = [
    { icon: FileSearch, title: 'License Verification', desc: 'Our team verifies your DRA license number', status: 'In progress', active: true },
    { icon: ShieldCheck, title: 'Background Check', desc: 'We confirm your pharmacy details and location', status: 'Pending', active: false },
    { icon: Mail, title: 'Approval Email', desc: "You'll receive login access via email", status: 'Pending', active: false },
  ];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem',
      background: 'var(--off-white)', position: 'relative', overflow: 'hidden'
    }}>

      {/* Background pattern */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(var(--gray-200) 1px, transparent 1px)', backgroundSize: '32px 32px', opacity: 0.5, zIndex: 0 }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 440 }}>

        {/* HERO ILLUSTRATION */}
        <div style={{ position: 'relative', width: 120, height: 120, marginBottom: '2rem' }}>
          <div style={{
            position: 'absolute', inset: 0, background: 'white', border: '4px solid var(--navy)', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(37,99,235,0.1)'
          }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', width: 4, height: 30, background: 'var(--navy)', borderRadius: 2, transformOrigin: 'bottom', bottom: '50%' }} />
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', width: 2, height: 45, background: 'var(--blue)', borderRadius: 1, transformOrigin: 'bottom', bottom: '50%' }} />
            <div style={{ position: 'absolute', width: 10, height: 10, background: 'var(--navy)', borderRadius: '50%' }} />
          </div>

          {/* Orbiting dots */}
          <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', inset: -20, pointerEvents: 'none' }}>
             <div style={{ width: 8, height: 8, background: 'var(--blue)', borderRadius: '50%', position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)' }} />
          </motion.div>
          <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 5, delay: 1, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', inset: -40, pointerEvents: 'none' }}>
             <div style={{ width: 8, height: 8, background: 'var(--blue)', borderRadius: '50%', position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.7 }} />
          </motion.div>
          <motion.div animate={{ rotate: [0, 360] }} transition={{ duration: 7, delay: 2, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', inset: -60, pointerEvents: 'none' }}>
             <div style={{ width: 8, height: 8, background: 'var(--blue)', borderRadius: '50%', position: 'absolute', top: 0, left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.4 }} />
          </motion.div>
        </div>

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          <div style={{ background: 'var(--green)', color: 'white', padding: '0.3rem 0.8rem', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '1.25rem' }}>
            <Check size={14} /> Account Submitted
          </div>

          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', color: 'var(--navy)', textAlign: 'center', marginBottom: '0.5rem' }}>Your account is under review</h1>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, color: 'var(--gray-600)', textAlign: 'center', marginBottom: '1.5rem', lineHeight: 1.5 }}>
            We'll email you at <b>{email}</b> within 24 hours once your pharmacy license has been verified.
          </p>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--blue-light)', borderRadius: 'var(--radius-full)', padding: '0.3rem 0.85rem', marginBottom: '2rem' }}>
            <Mail size={14} color="var(--blue)" />
            <span style={{ fontSize: '0.82rem', color: 'var(--blue)', fontWeight: 500 }}>{email}</span>
          </div>

          {/* CHECKLIST */}
          <div style={{ background: 'white', border: '1px solid var(--gray-200)', borderRadius: 16, padding: '1.5rem', width: '100%', marginBottom: '2rem', boxShadow: 'var(--shadow-card)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.9rem', marginBottom: '1.5rem', color: 'var(--navy)' }}>What happens next</h3>

            <div style={{ position: 'relative' }}>
              {checklistItems.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.15 }}
                  style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start', paddingBottom: i < 2 ? '1rem' : 0, position: 'relative' }}
                >
                  {i < 2 && <div style={{ position: 'absolute', left: 15, top: 32, width: 2, height: 'calc(100% - 10px)', background: 'var(--gray-200)' }} />}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: item.active ? 'var(--blue)' : 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                    <item.icon size={16} color={item.active ? 'white' : 'var(--gray-500)'} />
                  </div>
                  <div style={{ paddingBottom: i < 2 ? '1rem' : 0 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.875rem', color: item.active ? 'var(--navy)' : 'var(--gray-600)' }}>{item.title}</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.8rem', color: 'var(--gray-500)', marginTop: 2, marginBottom: 4 }}>{item.desc}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 500, color: item.active ? 'var(--amber)' : 'var(--gray-400)' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.active ? 'var(--amber)' : 'var(--gray-300)' }} />
                      {item.status}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
            <Button variant="primary" icon={RefreshCw} onClick={checkStatus} loading={isChecking} style={{ width: '100%' }}>Check Approval Status</Button>

            <a href="mailto:support@medsenseai.com" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--gray-600)', fontSize: '0.85rem', textDecoration: 'none' }}>
              <Mail size={14} /> Need help? Contact support →
            </a>

            <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--gray-400)', fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '1rem' }}>
              <LogOut size={12} /> Sign out and use different account
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
