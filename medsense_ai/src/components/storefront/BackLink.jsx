import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function BackLink({ to, children = 'Back', style }) {
  return <Link className="sf-button-secondary" to={to}
    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', ...style }}>
    <ArrowLeft size={16} aria-hidden="true" />{children}
  </Link>;
}
