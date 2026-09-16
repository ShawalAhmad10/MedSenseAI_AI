// src/pages/auth/LoginPage.jsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle, ExternalLink, Activity, ChevronLeft } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import Button from '../../components/common/Button';
import { usePharmacistAuth } from '../../hooks/usePharmacistAuth';
import { useToast } from '../../hooks/useToast';
import { authService } from '../../services/authService';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState({});
  const [shake, setShake] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const { login, isLoading } = usePharmacistAuth();
  const { showToast } = useToast();
  const AUTH_KEY = 'medsense_auth_user';
  function validate() {
    const errs = {};
    if (!email) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email format';
    if (!password) errs.password = 'Password is required';
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters';
    return errs;
  }
  async function handleSubmit() {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); setShake(true); setTimeout(() => setShake(false), 600); return; }
    try { await login(email, password, rememberMe); }
    catch (err) { const msg = err.message || 'Invalid email or password'; setErrors({ form: msg }); showToast({ type: 'error', message: msg }); setShake(true); setTimeout(() => setShake(false), 600); }
  }
  const handleGoogleLogin = useGoogleLogin({
    onSuccess: async (t) => {
      setGoogleLoading(true);
      try {
        const r = await authService.googleLogin(t.access_token);
        if (r.success) {
          if (r.data?.requiresPharmacyDetails || r.data?.isNewAccount) {
            // New account — send to register page to complete pharmacy details
            showToast({ type: 'info', message: 'Please complete your pharmacy details to finish registration.' });
            navigate('/pharmacist/register', { state: { googleEmail: r.data?.email, googleName: r.data?.fullName, googleId: r.data?.id, fromGoogle: true } });
            return;
          }
          const s = rememberMe ? localStorage : sessionStorage;
          s.setItem(AUTH_KEY, JSON.stringify({ ...r.data.user, token: r.data.token, loginAt: new Date().toISOString() }));
          showToast({ type: 'success', message: 'Google login successful!' });
          navigate('/pharmacist/dashboard');
        }
      } catch (e) {
        const code = e.response?.data?.code;
        const msg  = e.response?.data?.message || 'Google login failed.';
        if (code === 'PENDING_APPROVAL') {
          navigate('/pharmacist/pending-approval', { state: { email: e.response?.data?.data?.email } });
          return;
        }
        if (code === 'ACCOUNT_SUSPENDED') {
          setErrors({ form: 'Your account has been suspended. Contact support.' });
          return;
        }
        setErrors({ form: msg });
      }
      finally { setGoogleLoading(false); }
    },
    onError: () => setErrors({ form: 'Google sign-in was cancelled.' }),
  });
  const features = ['Drug interaction detection in real-time', 'AI-powered sales analytics & lead scoring', 'Smart inventory management & alerts'];
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw' }}>
      <div className="brand-panel" style={{ flex: 1, background: 'var(--auth-panel-bg)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '3rem 4rem' }}>
        <style>{`.brand-panel { display: flex; } @media (max-width: 768px) { .brand-panel { display: none !important; } }`}</style>
        <div style={{ position: 'relative', zIndex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Activity color="white" size={32} /><div><h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, color: 'white', fontSize: '1.4rem', margin: 0 }}>MedSenseAI</h2><p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', margin: 0 }}>for Pharmacists</p></div></div></div>
        <div style={{ position: 'relative', zIndex: 1, marginTop: '2rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'white', fontSize: '1.4rem', marginBottom: '0.5rem' }}>Welcome back, pharmacist</h2>
          <p style={{ fontWeight: 300, color: 'rgba(255,255,255,0.7)', marginBottom: '2rem' }}>Your AI-powered pharmacy platform</p>
          {features.map((f, i) => (<div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)"/><path d="M9 12l2 2 4-4" stroke="white"/></svg><span style={{ color: 'rgba(255,255,255,0.88)', fontSize: '0.875rem', fontWeight: 300 }}>{f}</span></div>))}
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}><a href="https://medsenseai.com" target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem', textDecoration: 'none' }}>Are you a patient? Visit medsenseai.com <ExternalLink size={14} /></a></div>
      </div>
      <div style={{ flex: 1, background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem' }}>
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} style={{ width: '100%', maxWidth: 400 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.8rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Welcome Back!</h1>
          <p style={{ fontWeight: 300, color: 'var(--gray-600)', fontSize: '0.875rem', marginBottom: '2.5rem' }}>Sign in by entering the information below</p>
          <div className="auth-field">
            <label className="auth-label">Email Address</label>
            <div style={{ position: 'relative' }}><Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} /><input className={`auth-input ${errors.email ? 'error' : ''}`} type="email" placeholder="email@example.com" style={{ paddingLeft: '2.5rem' }} value={email} onChange={e => { setEmail(e.target.value); if (errors.email) setErrors({ ...errors, email: null }); }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} /></div>
            {errors.email && <p className="auth-error-msg"><AlertCircle size={12}/>{errors.email}</p>}
          </div>
          <div className="auth-field">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}><label className="auth-label" style={{ marginBottom: 0 }}>Password</label><Link to="/pharmacist/forgot-password" style={{ fontSize: '0.78rem', color: 'var(--blue)', textDecoration: 'none' }}>Forgot Password?</Link></div>
            <div style={{ position: 'relative' }}><Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} /><input className={`auth-input ${errors.password ? 'error' : ''}`} type={showPassword ? 'text' : 'password'} placeholder="••••••••••••" style={{ paddingLeft: '2.5rem', paddingRight: '2.75rem' }} value={password} onChange={e => { setPassword(e.target.value); if (errors.password) setErrors({ ...errors, password: null }); }} onKeyDown={e => e.key === 'Enter' && handleSubmit()} /><button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', padding: 4 }}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div>
            {errors.password && <p className="auth-error-msg"><AlertCircle size={12}/>{errors.password}</p>}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1.5rem' }}><input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--blue)', cursor: 'pointer' }} /><span style={{ fontSize: '0.82rem', color: 'var(--gray-600)' }}>Remember Me</span></label>
          <motion.div animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.4 }}>
            {errors.form && (<div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontSize: '0.85rem', fontWeight: 500 }}><AlertCircle size={16} /> {errors.form}</div>)}
            <Button variant="primary" size="lg" loading={isLoading} icon={ArrowRight} iconPosition="right" onClick={handleSubmit} style={{ width: '100%', marginBottom: '1.25rem' }}>Continue</Button>
          </motion.div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}><div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }} /><span style={{ fontSize: '0.78rem', color: 'var(--gray-400)' }}>or continue with</span><div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }} /></div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleGoogleLogin()} disabled={googleLoading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '0.7rem', background: 'white', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius-btn)', cursor: googleLoading ? 'not-allowed' : 'pointer', color: 'var(--gray-700)', fontSize: '0.88rem', fontWeight: 600, marginBottom: '1.5rem', opacity: googleLoading ? 0.7 : 1 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            {googleLoading ? 'Signing in...' : 'Continue with Google'}
          </motion.button>
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--gray-600)' }}>Don't have an account? <Link to="/pharmacist/register" style={{ color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>Start your free trial</Link></p>
        </motion.div>
      </div>
    </div>
  );
}
