import React from 'react';
import { motion } from 'framer-motion';

const LABELS = {
  product_viewed: 'Product Viewed',
  cart_item_added: 'Added to Cart',
  checkout_started: 'Checkout Started',
  order_created: 'Accepted Order'
};

export default function FunnelStagesCard({
  data = [],
  overallConversion = null,
  measurement = ''
}) {
  const maxSessions = Math.max(
    1,
    ...data.map((row) => Number(row.sessions || 0))
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="dash-card"
      style={{
        padding: '1.5rem',
        height: '100%'
      }}
    >
      <div style={{ marginBottom: '1.25rem' }}>
        <h3
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '1.1rem',
            margin: '0 0 4px'
          }}
        >
          Observed Storefront Funnel
        </h3>

        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--gray-400)',
            margin: 0
          }}
        >
          Real observed sessions from view to accepted order
        </p>
      </div>

      {data.length === 0 ? (
        <div
          style={{
            minHeight: 260,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--gray-400)',
            fontSize: '0.85rem'
          }}
        >
          No observed storefront funnel events yet.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}
        >
          {data.map((row) => {
            const sessions =
              Number(row.sessions || 0);

            const width =
              (sessions / maxSessions) * 100;

            return (
              <div key={row.eventName}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    marginBottom: 5
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      color: 'var(--navy)'
                    }}
                  >
                    {LABELS[row.eventName] ||
                      row.eventName}
                  </span>

                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--gray-500)'
                    }}
                  >
                    {sessions} sessions · {row.events} events
                  </span>
                </div>

                <div
                  style={{
                    height: 8,
                    borderRadius: 10,
                    background: 'var(--dash-bg)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      width: `${width}%`,
                      height: '100%',
                      borderRadius: 10,
                      background: 'var(--blue)'
                    }}
                  />
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: '0.68rem',
                    color: 'var(--gray-400)'
                  }}
                >
                  {row.conversion === null ||
                  row.conversion === undefined
                    ? 'First observed stage'
                    : `${row.conversion}% of previous observed stage sessions`}
                </div>
              </div>
            );
          })}

          <div
            style={{
              marginTop: '0.5rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--dash-border)'
            }}
          >
            <span
              style={{
                display: 'block',
                fontSize: '0.7rem',
                color: 'var(--gray-400)'
              }}
            >
              Overall observed conversion
            </span>

            <strong
              style={{
                fontSize: '1.35rem',
                color: 'var(--navy)'
              }}
            >
              {typeof overallConversion === 'number'
                ? `${overallConversion}%`
                : '—'}
            </strong>
          </div>
        </div>
      )}

      {measurement && (
        <p
          style={{
            margin: '1rem 0 0',
            fontSize: '0.68rem',
            lineHeight: 1.5,
            color: 'var(--gray-400)'
          }}
        >
          {measurement}
        </p>
      )}
    </motion.div>
  );
}