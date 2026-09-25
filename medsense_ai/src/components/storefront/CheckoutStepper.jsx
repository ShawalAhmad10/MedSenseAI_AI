import React from 'react';

const steps = ['Address', 'Prescription', 'Payment', 'Review'];

export default function CheckoutStepper({ activeStep }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.8rem', marginBottom: '1.25rem' }}>
      {steps.map((step, index) => {
        const state = index + 1 < activeStep ? 'done' : index + 1 === activeStep ? 'active' : 'idle';
        const styles = {
          done: { background: '#edfdf5', color: '#047857', border: '1px solid rgba(16,185,129,0.18)' },
          active: { background: 'var(--sf-primary-soft)', color: 'var(--sf-primary)', border: '1px solid var(--sf-border)' },
          idle: { background: 'var(--sf-surface-alt)', color: 'var(--sf-text-muted)', border: '1px solid var(--sf-border)' },
        };

        return (
          <div
            key={step}
            style={{
              ...styles[state],
              borderRadius: 18,
              padding: '0.9rem',
              fontWeight: 700,
              minHeight: 74,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '0.78rem' }}>Step {index + 1}</span>
            <span>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
