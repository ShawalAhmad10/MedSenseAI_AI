// src/pages/auth/ForgotPassword.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LockKeyhole, ShieldCheck, KeyRound, Mail, Send, CheckCircle, AlertCircle, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Button from '../../components/common/Button';
import { useToast } from '../../hooks/useToast';
import { authService } from '../../services/authService';

export default function ForgotPassword() {
  const [step, setStep] = useState(0); // 0, 1, 2
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNew, setConfirmNew] = useState('');
  
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [passwordScore, setPasswordScore] = useState(0);
  const [otpError, setOtpError] = useState(false);
  const [devOtp, setDevOtp] = useState('');
  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  
  const otpRefs = useRef([]);
  const { showToast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let s = 0;
    if (newPassword.length >= 8) s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[^A-Za-z0-9]/.test(newPassword)) s++;
    setPasswordScore(s);
  }, [newPassword]);

  useEffect(() => {
    if (step === 1) {
      const interval = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000);
      return () => clearInterval(interval);
    }
  }, [step]);

  function handleOtpChange(index, value) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setOtpError(false);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    if (newOtp.every(d => d !== '') && index === 5) handleVerify(newOtp.join(''));
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  }

  function handleOtpPaste(e) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = Array(6).fill('');
    pasted.split('').forEach((char, i) => { newOtp[i] = char; });
    setOtp(newOtp);
    if (pasted.length === 6) handleVerify(pasted);
    else otpRefs.current[pasted.length]?.focus();
  }

  async function handleSend() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Valid email is required.');
      return;
    }

    setIsSending(true);
    setError('');
    try {
      const response = await authService.forgotPassword(email);
      if (!response.success) {
        throw new Error(response.message || 'Failed to send reset code.');
      }
      showToast({ type: 'success', message: response.message || 'Reset code sent to your email.' });
      // Dev mode — auto-fill OTP from response
      if (response.devOtp) {
        setDevOtp(response.devOtp);
        const digits = response.devOtp.split('');
        setOtp(digits);
      }
      setStep(1);
      setSeconds(60);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to send OTP. Please try again.';
      setError(msg);
    } finally {
      setIsSending(false);
    }
  }

  async function handleResend() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Valid email is required to resend the code.');
      return;
    }

    setIsSending(true);
    setError('');
    try {
      const response = await authService.forgotPassword(email);
      if (!response.success) {
        throw new Error(response.message || 'Unable to resend code.');
      }
      showToast({ type: 'success', message: response.message || 'Reset code resent to your email.' });
      setSeconds(60);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Unable to resend code. Please try again.';
      setError(msg);
    } finally {
      setIsSending(false);
    }
  }

  async function handleVerify(code = otp.join('')) {
    if (code.length !== 6) {
      showToast({ type: 'error', message: 'Please enter the 6-digit code.' });
      return;
    }
    // For password reset, we don't verify OTP separately —
    // OTP is verified when resetPassword is called.
    // Just move to step 2 (new password screen).
    setShowPwd(false);
    setShowConfirmPwd(false);
    setNewPassword('');
    setConfirmNew('');
    setStep(2);
  }

  async function handleReset() {
    if (!newPassword || newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNew) {
      setError('Passwords do not match.');
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must have at least one uppercase letter.');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError('Password must have at least one number.');
      return;
    }

    setIsResetting(true);
    setError('');
    try {
      const response = await authService.resetPassword(email, otp.join(''), newPassword);
      if (!response.success) {
        throw new Error(response.message || 'Error resetting password');
      }
      showToast({ type: 'success', message: response.message || 'Password reset successfully.' });
      setStep(3);
      setTimeout(() => navigate('/pharmacist/login'), 2000);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Error resetting password. Please try again.';
      setError(msg);
    } finally {
      setIsResetting(false);
    }
  }


  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 50%, #ecfdf5 100%)', backgroundSize: '400% 400%', animation: 'gradientShift 12s ease infinite'
    }}>
      <div style={{
        background: 'white', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-float)', padding: '2.5rem', width: '100%', maxWidth: 440, position: 'relative'
      }}>
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
            
            {step === 0 && (
              <div>
                <Link to="/pharmacist/login" style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', color: 'var(--gray-500)' }}><ArrowLeft size={20} /></Link>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                   <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity }}><LockKeyhole size={48} color="var(--blue)" /></motion.div>
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)', textAlign: 'center', marginBottom: '0.5rem' }}>Forgot your password?</h2>
                <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', textAlign: 'center', marginBottom: '2rem' }}>Enter your email and we'll send you a reset code</p>
                <form onSubmit={e => { e.preventDefault(); handleSend(); }}>
                  <div className="auth-field">
                    <div style={{ position: 'relative' }}>
                      <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                      <input className="auth-input" type="email" placeholder="email@pharmacy.com" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} style={{ paddingLeft: '2.5rem', borderColor: error ? 'var(--red, #ef4444)' : undefined }} />
                    </div>
                  </div>
                  {error && (
                    <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertCircle size={14} />{error}
                    </p>
                  )}
                  <Button type="submit" variant="primary" size="lg" loading={isSending} style={{ width: '100%', marginBottom: '1rem' }} icon={Send} iconPosition="right">Send Reset Code</Button>
                </form>
                <p style={{ textAlign: 'center' }}><Link to="/pharmacist/login" style={{ fontSize: '0.85rem', color: 'var(--gray-500)', textDecoration: 'none' }}>Back to login</Link></p>
              </div>
            )}

            {step === 1 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                   <ShieldCheck size={48} color="var(--blue)" />
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)', textAlign: 'center', marginBottom: '0.5rem' }}>Check your email</h2>
                <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', textAlign: 'center', marginBottom: '2rem' }}>We sent a 6-digit code to {email}</p>
                
                {/* Dev mode OTP hint */}
                {devOtp && (
                  <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', textAlign: 'center', fontSize: '0.85rem', color: '#92400e' }}>
                    <strong>Dev Mode — Your OTP:</strong>
                    <span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 800, color: '#1e3a8a', marginLeft: 8, letterSpacing: 4 }}>{devOtp}</span>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <motion.input key={i} ref={el => otpRefs.current[i] = el} type="text" inputMode="numeric" maxLength={1} value={otp[i]} onChange={e => handleOtpChange(i, e.target.value)} onKeyDown={e => handleOtpKeyDown(i, e)} onPaste={i === 0 ? handleOtpPaste : undefined} animate={otpError ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.4 }} style={{ width: 52, height: 60, textAlign: 'center', fontSize: '1.5rem', fontFamily: 'var(--font-display)', fontWeight: 700, border: `2px solid ${otp[i] ? 'var(--blue)' : otpError ? 'var(--red)' : 'var(--gray-200)'}`, borderRadius: 12, outline: 'none', background: otp[i] ? 'var(--blue-light)' : 'white', transition: 'all 0.2s', color: 'var(--navy)' }} />
                  ))}
                </div>

                <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                  {seconds > 0 ? <p style={{ color: 'var(--gray-500)' }}>Resend code in 0:{seconds.toString().padStart(2, '0')}</p> : <p style={{ color: 'var(--gray-600)' }}>Didn't receive it? <button type="button" onClick={handleResend} style={{ border: 'none', background: 'none', padding: 0, margin: 0, color: 'var(--blue)', cursor: 'pointer', fontWeight: 500 }}>Resend code →</button></p>}
                </div>
                
                {error && (
                  <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                    <AlertCircle size={14} />{error}
                  </p>
                )}
                <Button variant="primary" size="lg" loading={isVerifying} onClick={() => handleVerify()} style={{ width: '100%' }}>Verify Code</Button>
              </div>
            )}

            {step === 2 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                   <KeyRound size={48} color="var(--green)" />
                </div>
                <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)', textAlign: 'center', marginBottom: '0.5rem' }}>Create new password</h2>
                <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', textAlign: 'center', marginBottom: '2rem' }}>Your new password must be different from your previous password</p>

                <div className="auth-field">
                  <div style={{ position: 'relative' }}>
                    <LockKeyhole size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                    <input className="auth-input" type={showPwd ? 'text' : 'password'} placeholder="New Password" value={newPassword} onChange={e => { setNewPassword(e.target.value); setError(''); }} style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }} />
                    <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}>{showPwd ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                  </div>
                  {newPassword && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                      {[1, 2, 3, 4].map(n => <motion.div key={n} animate={{ background: n <= passwordScore ? ['', 'var(--strength-weak)', 'var(--strength-fair)', 'var(--strength-good)', 'var(--strength-strong)'][passwordScore] : 'var(--gray-200)' }} style={{ flex: 1, height: 4, borderRadius: 2 }} />)}
                    </div>
                  )}
                </div>

                <div className="auth-field">
                  <div style={{ position: 'relative' }}>
                    <LockKeyhole size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                    <input className="auth-input" type={showConfirmPwd ? 'text' : 'password'} placeholder="Confirm New Password" value={confirmNew} onChange={e => { setConfirmNew(e.target.value); setError(''); }} style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }} />
                    <button type="button" onClick={() => setShowConfirmPwd(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', padding: 4 }}>{showConfirmPwd ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
                  </div>
                </div>

                {error && (
                  <p style={{ color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <AlertCircle size={14} />{error}
                  </p>
                )}
                <Button variant="primary" size="lg" loading={isResetting} onClick={handleReset} style={{ width: '100%' }} icon={CheckCircle} iconPosition="right">Reset Password</Button>
              </div>
            )}

            {step === 3 && (
              <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
                  <CheckCircle size={64} color="var(--green)" />
                </motion.div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Password Reset Successfully</h3>
                <p style={{ color: 'var(--gray-600)' }}>Redirecting to login...</p>
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
