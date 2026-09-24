// src/pages/auth/RegisterPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Mail, Lock, Eye, EyeOff, Building2, FileText, MapPin, Phone, ChevronDown, Check, CheckCircle, XCircle, Info, ArrowLeft, ArrowRight, ShieldCheck, Clock, Package, Zap, AlertCircle } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import Button from '../../components/common/Button';
import { useToast } from '../../hooks/useToast';
import {
  authService,
  clearPharmacistGoogleOnboarding,
  getPharmacistGoogleOnboarding,
  savePharmacistGoogleOnboarding,
} from '../../services/authService';
import { writePharmacistAuth } from '../../services/pharmacistAuthSession';

export default function RegisterPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [errors, setErrors] = useState({});
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Google signup state — tracks if we came from Google (no password flow)
  const [isGoogleSignup, setIsGoogleSignup] = useState(false);
  const [googleOnboarding, setGoogleOnboarding] = useState(null);

  // Step 1: Account
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [passwordScore, setPasswordScore] = useState(0);

  // Step 2: Profile Details
  const [licenseNumber, setLicenseNumber] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('Punjab');
  const [showProvinceSelect, setShowProvinceSelect] = useState(false);
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  // If redirected from login page after Google sign-in with incomplete profile
  useEffect(() => {
    const context = getPharmacistGoogleOnboarding();
    if (context) {
      setIsGoogleSignup(true);
      setGoogleOnboarding(context);
      setEmail(context.email);
      setFullName(context.fullName);
      setCurrentStep(1); // skip to profile details
    } else if (location.state?.fromGoogle) {
      showToast({ type: 'error', message: 'Your Google onboarding session is invalid or expired. Please sign in with Google again.' });
      navigate('/pharmacist/login', { replace: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 3: Verify
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState(false);
  const [seconds, setSeconds] = useState(60);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const otpRefs = useRef([]);

  // Step 4: Plan
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [billing, setBilling] = useState('monthly');
  const [isSelectingPlan, setIsSelectingPlan] = useState(false);

  const steps = [
    { label: 'Account' },
    { label: 'Profile' },
    { label: 'Verify' },
  ];

  useEffect(() => {
    let s = 0;
    if (password.length >= 8) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    setPasswordScore(s);
  }, [password]);

  useEffect(() => {
    if (currentStep === 2 && !isVerified) {
      const interval = setInterval(() => setSeconds(s => s > 0 ? s - 1 : 0), 1000);
      return () => clearInterval(interval);
    }
  }, [currentStep, isVerified]);

  function validateStep(step) {
    const errs = {};
    if (step === 0) {
      if (!fullName || fullName.length < 2) errs.fullName = 'Full name is required';
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Valid email required';
      if (password.length < 8) errs.password = 'Password must be at least 8 characters';
      if (password !== confirmPassword) errs.confirmPassword = 'Passwords must match';
      if (!agreeTerms) errs.agreeTerms = 'You must agree to terms';
    } else if (step === 1) {
      if (!licenseNumber) errs.licenseNumber = 'License number required';
      if (!phone || phone.replace(/\D/g, '').length < 7) errs.phone = 'Valid phone number required';
      if (!city) errs.city = 'City is required';
    }
    return errs;
  }

  // Google Sign-Up for pharmacist
  const handleGoogleSignup = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const result = await authService.googleLogin(tokenResponse.access_token);
        if (result.success) {
          if (result.data?.isNewAccount || result.data?.requiresPharmacyDetails) {
            // New Google account — skip account step, go straight to profile details
            if (!savePharmacistGoogleOnboarding(result.data)) {
              showToast({ type: 'error', message: 'Google onboarding session was not created. Please sign in with Google again.' });
              return;
            }
            const context = getPharmacistGoogleOnboarding();
            setEmail(result.data?.email ?? '');
            setFullName(result.data?.fullName ?? '');
            setIsGoogleSignup(true);
            setGoogleOnboarding(context);
            showToast({ type: 'success', message: 'Google account linked! Please complete your profile details.' });
            setDirection(1);
            setCurrentStep(1); // Go directly to profile step
          } else if (result.data?.token) {
            // Existing approved account — log them in directly
            writePharmacistAuth(
              { ...result.data.user, token: result.data.token },
              false
            );
            showToast({ type: 'success', message: 'Google login successful!' });
            navigate('/pharmacist/dashboard');
          } else {
            // Existing but pending approval
            showToast({ type: 'info', message: result.message || 'Account pending admin approval.' });
            navigate('/pharmacist/pending-approval');
          }
        }
      } catch (err) {
        const msg = err.response?.data?.message ?? 'Google signup failed.';
        // If already registered but not approved, redirect to pending
        if (err.response?.data?.code === 'PENDING_APPROVAL') {
          navigate('/pharmacist/pending-approval');
          return;
        }
        showToast({ type: 'error', message: msg });
      }
    },
    onError: () => showToast({ type: 'error', message: 'Google sign-in was cancelled.' }),
  });

  async function goNext() {
    const errs = validateStep(currentStep);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});

    if (currentStep === 1) {
      if (isGoogleSignup) {
        // Google user — save details via completeGoogleProfile endpoint
        try {
          const context = googleOnboarding || getPharmacistGoogleOnboarding();
          if (!context) {
            clearPharmacistGoogleOnboarding();
            showToast({ type: 'error', message: 'Your Google onboarding session is invalid or expired. Please sign in with Google again.' });
            navigate('/pharmacist/login');
            return;
          }

          const result = await authService.updateGooglePharmacistDetails(
            {
              email,
              licenseNumber,
              city,
              province,
              phone,
              address,
            },
            context.onboardingToken
          );
          // Backend returns a token after completing profile — log in directly
          if (result?.data?.token) {
            clearPharmacistGoogleOnboarding();
            writePharmacistAuth(
              { ...result.data.user, token: result.data.token },
              false
            );
            showToast({ type: 'success', message: 'Profile complete! Welcome to MedSenseAI.' });
            navigate('/pharmacist/dashboard');
          } else {
            showToast({ type: 'success', message: 'Details saved! Your account is awaiting admin approval.' });
            navigate('/pharmacist/pending-approval', { state: { email } });
          }
        } catch (err) {
          const code = err.response?.data?.code;
          if ([
            'ONBOARDING_TOKEN_REQUIRED',
            'ONBOARDING_TOKEN_EXPIRED',
            'INVALID_ONBOARDING_TOKEN',
            'WRONG_ONBOARDING_TOKEN_TYPE',
            'ONBOARDING_IDENTITY_MISMATCH',
          ].includes(code)) {
            clearPharmacistGoogleOnboarding();
            showToast({ type: 'error', message: 'Your Google onboarding session is invalid or expired. Please sign in with Google again.' });
            navigate('/pharmacist/login');
            return;
          }
          showToast({ type: 'error', message: err.response?.data?.message || 'Failed to save details. Please try again.' });
        }
        return;
      }

      // Normal (non-Google) registration
      try {
        const response = await authService.register({
          fullName, email, password, licenseNumber,
          city, province, phone, address,
        });
        if (!response.success) {
          showToast({ type: 'error', message: response.message || 'Registration failed.' });
          return;
        }
        showToast({ type: 'success', message: response.message || 'Registration successful!' });
        // Auto-approved — skip OTP, go to plan
        if (response.data?.autoApproved) {
          setDirection(1);
          setCurrentStep(3);
          return;
        }
      } catch (err) {
        showToast({ type: 'error', message: err.response?.data?.message || err.message || 'Registration failed.' });
        return;
      }
    }

    setDirection(1);
    setCurrentStep((s) => s + 1);
  }

  async function handleResendOtp() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast({ type: 'error', message: 'Valid email is required to resend the code.' });
      return;
    }

    try {
      await authService.resendOtp(email);
      showToast({ type: 'success', message: 'Verification code resent to your email.' });
      setSeconds(60);
    } catch (err) {
      showToast({ type: 'error', message: 'Unable to resend code. Please try again later.' });
    }
  }

  function goBack() {
    setDirection(-1);
    setCurrentStep(s => s - 1);
  }

  function handleOtpChange(index, value) {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setOtpError(false);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
    if (newOtp.every(d => d !== '') && index === 5) {
      handleVerify(newOtp.join(''));
    }
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

  async function handleVerify(code = otp.join('')) {
    if (code.length !== 6) return;
    setIsVerifying(true);
    try {
      await authService.verifyOtp(email, code);
      setIsVerified(true);
      showToast({ type: 'success', message: 'Email verified! Account approved.' });
      setTimeout(() => {
        setDirection(1);
        setCurrentStep(3); // Move to plan selection
      }, 1500);
    } catch (err) {
      setOtpError(true);
      showToast({ type: 'error', message: 'Incorrect OTP. Please try again.' });
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleSelectPlan() {
    setIsSelectingPlan(true);
    try {
      await authService.selectPlan(selectedPlan, billing, email, pharmacyName);
      showToast({ type: 'success', message: 'Account ready! Please log in.' });
      navigate('/pharmacist/login');
    } catch (e) {
      showToast({ type: 'error', message: 'Error selecting plan' });
      navigate('/pharmacist/login');
    } finally {
      setIsSelectingPlan(false);
    }
  }

  const renderStep = () => {
    if (currentStep === 0) {
      const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
      const strengthColors = ['', 'var(--strength-weak)', 'var(--strength-fair)', 'var(--strength-good)', 'var(--strength-strong)'];
      return (
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Create your account</h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', marginBottom: '2rem' }}>Start your 14-day free trial — no credit card required</p>

          <div className="auth-field">
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
              <input className={`auth-input ${errors.fullName ? 'error' : ''}`} placeholder="Dr. Ahmed Khan" value={fullName} onChange={e => setFullName(e.target.value)} style={{ paddingLeft: '2.5rem' }} />
            </div>
            {errors.fullName && <p className="auth-error-msg"><AlertCircle size={12}/>{errors.fullName}</p>}
          </div>

          <div className="auth-field">
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
              <input className={`auth-input ${errors.email ? 'error' : ''}`} type="email" placeholder="email@pharmacy.com" value={email} onChange={e => setEmail(e.target.value)} style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }} />
              {email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && <CheckCircle size={14} color="var(--green)" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)' }} />}
            </div>
            {errors.email && <p className="auth-error-msg"><AlertCircle size={12}/>{errors.email}</p>}
          </div>

          <div className="auth-field">
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
              <input className={`auth-input ${errors.password ? 'error' : ''}`} type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', padding: 4 }}>
                {showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {password.length > 0 && (
              <>
                <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                  {[1, 2, 3, 4].map(n => (
                    <motion.div key={n} animate={{ background: n <= passwordScore ? strengthColors[passwordScore] : 'var(--gray-200)', scaleX: n <= passwordScore ? 1 : 0.7 }} style={{ flex: 1, height: 4, borderRadius: 2, transformOrigin: 'left' }} />
                  ))}
                </div>
                <p style={{ fontSize: '0.72rem', marginTop: 4, color: strengthColors[passwordScore], fontWeight: 500 }}>{passwordScore > 0 && strengthLabels[passwordScore]}</p>
              </>
            )}
            {errors.password && <p className="auth-error-msg"><AlertCircle size={12}/>{errors.password}</p>}
          </div>

          <div className="auth-field">
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
              <input className={`auth-input ${errors.confirmPassword ? 'error' : ''}`} type={showConfirm ? 'text' : 'password'} placeholder="Confirm Password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={{ paddingLeft: '2.5rem', paddingRight: '4rem' }} />
              <div style={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
                {confirmPassword.length > 0 && (confirmPassword === password ? <CheckCircle size={16} color="var(--green)" /> : <XCircle size={16} color="var(--red)" />)}
              </div>
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', display: 'flex', padding: 4 }}>
                {showConfirm ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {errors.confirmPassword && <p className="auth-error-msg"><AlertCircle size={12}/>{errors.confirmPassword}</p>}
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
            <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--blue)', marginTop: 2, cursor: 'pointer' }} />
            <span style={{ fontSize: '0.82rem', color: 'var(--gray-600)', lineHeight: 1.4 }}>
              I agree to the <a href="#" style={{ color: 'var(--blue)', textDecoration: 'none' }}>Terms of Service</a> and <a href="#" style={{ color: 'var(--blue)', textDecoration: 'none' }}>Privacy Policy</a>
            </span>
          </label>
          {errors.agreeTerms && <p className="auth-error-msg" style={{ marginTop: '-1rem', marginBottom: '1rem' }}><AlertCircle size={12}/>{errors.agreeTerms}</p>}

          <Button variant="primary" size="lg" style={{ width: '100%' }} onClick={goNext}>Continue to Profile Info →</Button>

          {/* Google Signup */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-400)' }}>or sign up with</span>
            <div style={{ flex: 1, height: 1, background: 'var(--gray-200)' }} />
          </div>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleGoogleSignup()}
            type="button"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '0.7rem', background: 'white', border: '1.5px solid var(--gray-200)', borderRadius: 'var(--radius-btn)', cursor: 'pointer', color: 'var(--gray-700)', fontSize: '0.88rem', fontWeight: 600 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </motion.button>
          <p style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--gray-600)', marginTop: '1.5rem' }}>
            Already have an account? <Link to="/pharmacist/login" style={{ color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>Log in</Link>
          </p>
        </div>
      );
    } else if (currentStep === 1) {
      return (
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Complete your profile</h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', marginBottom: '2rem' }}>We need a few details to verify your account</p>

          <div className="auth-field">
            <div style={{ position: 'relative' }}>
              <FileText size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
              <input className={`auth-input ${errors.licenseNumber ? 'error' : ''}`} placeholder="License Number (PM-2024-XXXXX)" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} style={{ paddingLeft: '2.5rem', paddingRight: '2rem' }} />
              <div title="Your Drug Regulatory Authority license number" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)', cursor: 'help' }}>
                <Info size={14} />
              </div>
            </div>
            {errors.licenseNumber && <p className="auth-error-msg"><AlertCircle size={12}/>{errors.licenseNumber}</p>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ position: 'relative' }}>
                <MapPin size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray-400)' }} />
                <input className={`auth-input ${errors.city ? 'error' : ''}`} placeholder="City (e.g. Lahore)" value={city} onChange={e => setCity(e.target.value)} style={{ paddingLeft: '2.5rem' }} />
              </div>
              {errors.city && <p className="auth-error-msg"><AlertCircle size={12}/>{errors.city}</p>}
            </div>
            <div style={{ position: 'relative' }}>
              <div className="auth-input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setShowProvinceSelect(!showProvinceSelect)}>
                <span>{province}</span>
                <ChevronDown size={16} color="var(--gray-400)" />
              </div>
              <AnimatePresence>
                {showProvinceSelect && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', zIndex: 10, marginTop: 4, boxShadow: 'var(--shadow-card)', overflow: 'hidden' }}>
                    {['Punjab', 'Sindh', 'KPK', 'Balochistan', 'ICT', 'AJK', 'GB'].map(opt => (
                      <div key={opt} onClick={() => { setProvince(opt); setShowProvinceSelect(false); }} style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--gray-100)' }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', border: `1px solid ${province === opt ? 'var(--blue)' : 'var(--gray-300)'}`, background: province === opt ? 'var(--blue)' : 'transparent' }} />
                        {opt}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="auth-field">
            <div style={{ display: 'flex', height: 'var(--auth-input-height)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 1rem', background: 'var(--gray-100)', border: '1.5px solid var(--auth-input-border)', borderRight: 'none', borderRadius: 'var(--auth-input-radius) 0 0 var(--auth-input-radius)', color: 'var(--gray-600)', fontSize: '0.9rem', fontWeight: 500 }}>
                +92
              </div>
              <input className={`auth-input ${errors.phone ? 'error' : ''}`} style={{ borderRadius: '0 var(--auth-input-radius) var(--auth-input-radius) 0', flex: 1 }} placeholder="300 0000000" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            {errors.phone && <p className="auth-error-msg"><AlertCircle size={12}/>{errors.phone}</p>}
          </div>

          <div className="auth-field">
            <div style={{ position: 'relative' }}>
              <MapPin size={16} style={{ position: 'absolute', left: 14, top: 16, color: 'var(--gray-400)' }} />
              <textarea className="auth-input" placeholder="Street address, area, city" rows={3} value={address} onChange={e => setAddress(e.target.value)} style={{ paddingLeft: '2.5rem', paddingTop: '1rem', height: 'auto', resize: 'none' }} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            {!isGoogleSignup && (
              <Button variant="ghost" onClick={goBack} icon={ArrowLeft} type="button">Back</Button>
            )}
            <Button variant="primary" onClick={goNext} style={{ flex: 1 }} icon={ArrowRight} iconPosition="right" type="button">
              {isGoogleSignup ? 'Submit & Await Approval' : 'Continue to Verification'}
            </Button>
          </div>
        </div>
      );
    } else if (currentStep === 2) {
      if (isVerified) {
        return (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }} style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <CheckCircle size={64} color="var(--green)" />
            </motion.div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Email verified!</h3>
            <p style={{ color: 'var(--gray-600)' }}>Proceeding to plan selection...</p>
          </div>
        );
      }
      return (
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Verify your email</h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', marginBottom: '1rem' }}>We sent a 6-digit code to {email || 'your email'} — check your inbox</p>

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--blue-light)', borderRadius: 'var(--radius-full)', padding: '0.3rem 0.85rem', marginBottom: '1.75rem' }}>
            <Mail size={14} color="var(--blue)" />
            <span style={{ fontSize: '0.82rem', color: 'var(--blue)', fontWeight: 500 }}>{email || 'example@email.com'}</span>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <motion.input
                key={i}
                ref={el => otpRefs.current[i] = el}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={otp[i]}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                onPaste={i === 0 ? handleOtpPaste : undefined}
                animate={otpError ? { x: [0, -8, 8, -5, 5, 0] } : {}}
                transition={{ duration: 0.4 }}
                style={{
                  width: 52, height: 60, textAlign: 'center', fontSize: '1.5rem', fontFamily: 'var(--font-display)', fontWeight: 700,
                  border: `2px solid ${otp[i] ? 'var(--blue)' : otpError ? 'var(--red)' : 'var(--gray-200)'}`,
                  borderRadius: 12, outline: 'none', background: otp[i] ? 'var(--blue-light)' : 'white', transition: 'all 0.2s', color: 'var(--navy)'
                }}
              />
            ))}
          </div>

          <div style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
            <AnimatePresence mode="wait">
              {seconds > 0 ? (
                <motion.p key="timer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ color: 'var(--gray-500)' }}>
                  Resend code in 0:{seconds.toString().padStart(2, '0')}
                </motion.p>
              ) : (
                <motion.p key="resend" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ color: 'var(--gray-600)' }}>
                  Didn't receive it? <button type="button" onClick={handleResendOtp} style={{ border: 'none', background: 'none', padding: 0, margin: 0, color: 'var(--blue)', cursor: 'pointer', fontWeight: 500 }}>Resend code →</button>
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <Button variant="primary" size="lg" loading={isVerifying} icon={ShieldCheck} iconPosition="right" onClick={() => handleVerify()} style={{ width: '100%' }}>Verify Email</Button>

          <Button variant="ghost" onClick={goBack} style={{ marginTop: '1rem', width: '100%', fontSize: '0.85rem' }} type="button">Back to edit email</Button>
        </div>
      );
    } else if (currentStep === 3) {
      return (
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--navy)', marginBottom: '0.5rem' }}>Choose your plan</h2>
          <p style={{ color: 'var(--gray-600)', fontSize: '0.875rem', marginBottom: '2rem' }}>You can upgrade anytime</p>

          <div style={{ display: 'flex', background: 'var(--gray-100)', padding: 4, borderRadius: 'var(--radius-full)', margin: '0 auto 2rem', width: 'fit-content' }}>
            <div onClick={() => setBilling('monthly')} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-full)', background: billing === 'monthly' ? 'white' : 'transparent', boxShadow: billing === 'monthly' ? 'var(--shadow-card)' : 'none', transition: 'all 0.2s' }}>Monthly</div>
            <div onClick={() => setBilling('annual')} style={{ padding: '0.4rem 1rem', fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer', borderRadius: 'var(--radius-full)', background: billing === 'annual' ? 'white' : 'transparent', boxShadow: billing === 'annual' ? 'var(--shadow-card)' : 'none', transition: 'all 0.2s' }}>Annual (Save 20%)</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>

            {/* Basic Plan */}
            <motion.div
              onClick={() => setSelectedPlan('basic')}
              animate={{ borderColor: selectedPlan === 'basic' ? 'var(--blue)' : 'var(--gray-200)', backgroundColor: selectedPlan === 'basic' ? 'rgba(219,234,254,0.4)' : '#fff', y: selectedPlan === 'basic' ? -4 : 0 }}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              style={{ cursor: 'pointer', border: '2px solid', borderRadius: 16, padding: '1.25rem', position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem' }}
            >
              <div style={{ background: 'var(--gray-100)', width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Package color="var(--blue)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>Basic</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Get started</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                 <div style={{ fontWeight: 700 }}>₨0</div>
                 <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>forever</div>
              </div>
            </motion.div>

            {/* Pro Plan */}
            <motion.div
              onClick={() => setSelectedPlan('pro')}
              animate={{ borderColor: selectedPlan === 'pro' ? 'var(--blue)' : 'var(--gray-200)', backgroundColor: selectedPlan === 'pro' ? 'rgba(219,234,254,0.4)' : '#fff', y: selectedPlan === 'pro' ? -4 : 0 }}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              style={{ cursor: 'pointer', border: '2px solid', borderColor: '#7c3aed', borderRadius: 16, padding: '1.25rem', position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem', overflow: 'hidden' }}
            >
              <div style={{ position: 'absolute', top: 0, right: 0, background: '#7c3aed', color: 'white', fontSize: '0.65rem', padding: '0.2rem 0.75rem', borderBottomLeftRadius: 8, fontWeight: 600 }}>RECOMMENDED</div>
              <div style={{ background: '#f3e8ff', width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Zap color="#7c3aed" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>Pro</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>Most popular</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                 <div style={{ fontWeight: 700 }}>₨{billing === 'monthly' ? '2,999' : '28,790'}</div>
                 <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)' }}>/{billing === 'monthly' ? 'mo' : 'yr'}</div>
              </div>
            </motion.div>

            {/* Enterprise Plan */}
            <motion.div
              onClick={() => setSelectedPlan('enterprise')}
              animate={{ borderColor: selectedPlan === 'enterprise' ? 'var(--blue)' : 'var(--gray-200)', backgroundColor: selectedPlan === 'enterprise' ? 'rgba(219,234,254,0.4)' : '#fff', y: selectedPlan === 'enterprise' ? -4 : 0 }}
              whileHover={{ y: -3 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              style={{ cursor: 'pointer', border: '2px solid', borderRadius: 16, padding: '1.25rem', position: 'relative', display: 'flex', alignItems: 'center', gap: '1rem' }}
            >
              <div style={{ background: 'var(--gray-100)', width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                 <Building2 color="var(--navy)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>Enterprise</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>For chains</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                 <div style={{ fontWeight: 700 }}>Custom</div>
              </div>
            </motion.div>

          </div>
          <Button variant="primary" size="lg" loading={isSelectingPlan} onClick={handleSelectPlan} style={{ width: '100%' }}>Start with {selectedPlan} →</Button>
        </div>
      );
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 50%, #ecfdf5 100%)',
      backgroundSize: '400% 400%',
      animation: 'gradientShift 12s ease infinite'
    }}>
      <div style={{
        background: 'white',
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-float)',
        padding: '2.5rem',
        width: '100%',
        maxWidth: 580,
        position: 'relative',
        overflow: 'hidden'
      }}>
        {currentStep < 3 && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '2.5rem' }}>
            {steps.map((step, i) => (
              <React.Fragment key={i}>
                <motion.div
                  animate={{
                    background: currentStep > i ? 'var(--green)' : currentStep === i ? 'var(--blue)' : 'var(--step-inactive)',
                    scale: currentStep === i ? 1.1 : 1
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' }}
                >
                  {currentStep > i ? <Check size={18} color="white" /> : <span style={{ color: 'white', fontWeight: 700, fontSize: '0.9rem' }}>{i + 1}</span>}
                  {currentStep === i && (
                    <motion.div animate={{ scale: [1, 1.5], opacity: [0.5, 0] }} transition={{ duration: 1.5, repeat: Infinity }} style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: '2px solid var(--blue)', pointerEvents: 'none' }} />
                  )}
                </motion.div>
                <div style={{ marginLeft: '0.5rem', whiteSpace: 'nowrap' }}>
                  <p style={{ fontSize: '0.65rem', color: 'var(--gray-400)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Step {i + 1}</p>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: currentStep >= i ? 'var(--navy)' : 'var(--gray-400)' }}>{step.label}</p>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ flex: 1, height: 2, margin: '0 0.75rem', background: 'var(--gray-200)', position: 'relative', overflow: 'hidden' }}>
                    <motion.div animate={{ width: currentStep > i ? '100%' : '0%' }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} style={{ position: 'absolute', inset: 0, background: 'var(--green)', transformOrigin: 'left' }} />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -40 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
