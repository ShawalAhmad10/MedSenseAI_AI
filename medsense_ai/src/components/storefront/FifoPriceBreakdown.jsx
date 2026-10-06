import React from 'react';
import { fifoBreakdown, fifoQuote } from '../../services/storefrontFifoPricing';

export default function FifoPriceBreakdown({ item }) {
  if (fifoQuote(item).length < 2) return null;
  return <p className="sf-muted" style={{ fontSize: '0.85rem', margin: '0.4rem 0' }}>
    Price breakdown: {fifoBreakdown(item)}
  </p>;
}
