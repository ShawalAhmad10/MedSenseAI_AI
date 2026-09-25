// src/components/common/Button.jsx
import React from 'react';
import { motion } from 'framer-motion';

export default function Button({ children, variant = 'primary', size = 'md', loading, icon: Icon, iconPosition = 'left', ...props }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      {...props}
      disabled={loading || props.disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        background: variant === 'primary' ? 'var(--blue)' : variant === 'ghost' ? 'transparent' : 'white',
        color: variant === 'primary' ? 'white' : 'var(--navy)',
        border: variant === 'outline' ? '1px solid var(--gray-200)' : 'none',
        padding: size === 'lg' ? '0.75rem 1.5rem' : '0.5rem 1rem',
        borderRadius: 'var(--radius-btn)',
        cursor: (loading || props.disabled) ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        opacity: loading ? 0.7 : 1,
        ...props.style
      }}
    >
      {loading ? <span>Loading...</span> : null}
      {!loading && Icon && iconPosition === 'left' && <Icon size={18} />}
      {!loading && children}
      {!loading && Icon && iconPosition === 'right' && <Icon size={18} />}
    </motion.button>
  );
}
