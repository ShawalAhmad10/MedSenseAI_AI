// Cart review with real-time data from database
import React, { useState } from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import InteractionBadge from '../../components/storefront/InteractionBadge';
import InteractionWarningModal from '../../components/storefront/InteractionWarningModal';
import EscalateToPharmacistModal from '../../components/storefront/EscalateToPharmacistModal';
import { getDdiPresentation } from '../../services/storefrontDdiService';
import { getInteractionAwareRecommendations } from '../../services/storefrontInteractionAwareRecommendationService';

function cartProductId(
  item
) {
  const raw =
    item?.product_id ??
    item?.productId ??
    item?.id;

  const cleaned =
    typeof raw === 'string'
      ? raw.replace(/^prod-/, '')
      : raw;

  const parsed =
    Number(cleaned);

  return (
    Number.isSafeInteger(parsed) &&
    parsed > 0
  )
    ? parsed
    : null;
}

function harmfulDdiProductIds(
  result
) {
  const ids =
    new Set();

  for (
    const pair
    of result?.pairs || []
  ) {
    if (
      pair?.interaction_found !==
      true
    ) {
      continue;
    }

    const severity =
      String(
        pair?.severity || ''
      )
        .trim()
        .toLowerCase();

    if (
      severity ===
      'minor'
    ) {
      continue;
    }

    for (
      const value
      of [
        ...(pair?.product_ids_a || []),
        ...(pair?.product_ids_b || []),
      ]
    ) {
      const id =
        Number(value);

      if (
        Number.isSafeInteger(id) &&
        id > 0
      ) {
        ids.add(id);
      }
    }
  }

  return [
    ...ids,
  ];
}
export default function CartPage() {
  const {
    items,
    prescriptionItems,
    removeItem,
    subtotal,
    updateQuantity,
    ddiLoading,
    ddiError,
    ddiWarnings,
    ddiCheckoutAllowed,
    ddiResult,
  } = useCart();
  const [showWarnings, setShowWarnings] = useState(false);
  const [showEscalation, setShowEscalation] = useState(false);

  const [
    alternativeLoadingId,
    setAlternativeLoadingId,
  ] = useState(null);

  const [
    alternativeReview,
    setAlternativeReview,
  ] = useState(null);

  const [
    alternativeError,
    setAlternativeError,
  ] = useState('');

  const deliveryFee = items.length > 0 ? 120 : 0;
  const ddiPresentation = getDdiPresentation(ddiResult, ddiError || '');

  const harmfulProductIds =
    harmfulDdiProductIds(
      ddiResult
    );

  const cartProductIds =
    items
      .map(
        cartProductId
      )
      .filter(Boolean);

  const cartSignature =
    [...cartProductIds]
      .sort(
        (a, b) =>
          a - b
      )
      .join('-');

  const visibleAlternativeReview =
    alternativeReview?.cartSignature ===
      cartSignature
      ? alternativeReview
      : null;

  const handleGovernedAlternativeCheck =
    async (
      sourceProductId
    ) => {
      setAlternativeLoadingId(
        sourceProductId
      );

      setAlternativeError('');

      try {
        const result =
          await getInteractionAwareRecommendations(
            sourceProductId,
            items,
            5
          );

        setAlternativeReview({
          sourceProductId,
          cartSignature,
          result,
        });
      } catch (error) {
        setAlternativeReview(
          null
        );

        setAlternativeError(
          error?.message ||
          'Could not check governed alternatives.'
        );
      } finally {
        setAlternativeLoadingId(
          null
        );
      }
    };

  return (
    <div className="storefront-shell">
      <div className="sf-grid-2">
        <section className="sf-card sf-section-card">
          <div className="sf-page-header">
            <div>
              <h1>Your Cart</h1>
              <p className="sf-section-subcopy" style={{ marginBottom: 0 }}>
                Review your items and proceed to checkout
              </p>
            </div>
            <InteractionBadge
              level={ddiLoading ? 'checking' : ddiPresentation.level}
              text={
                items.length === 0
                  ? 'Add medicines to begin DDI review'
                  : ddiLoading
                    ? 'Checking drug interactions...'
                    : ddiPresentation.text
              }
            />
          </div>

          {items.length === 0 ? (
            <div className="sf-empty">Your cart is empty. Browse categories or top deals to start an order.</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.9rem' }}>
              {items.map((item) => (
                <article className="sf-summary-block" key={item.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ display: 'block' }}>{item.name}</strong>
                      <span className="sf-muted">{item.subtitle}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.6rem' }}>
                        <span className="sf-badge">{item.category}</span>
                        {item.requiresPrescription && <span className="sf-badge-warning">Prescription needed</span>}
                        {item.stockQty !== undefined && (
                          <span className="sf-badge" style={{ 
                            background: item.stockQty > 10 ? '#10b981' : item.stockQty > 0 ? '#f59e0b' : '#ef4444',
                            color: '#fff'
                          }}>
                            {item.stockQty > 0 ? `${item.stockQty} in stock` : 'Out of stock'}
                          </span>
                        )}
                      </div>
                    </div>
                    <button className="sf-button-ghost" onClick={() => removeItem(item.id)} type="button">
                      Remove
                    </button>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <button 
                        className="sf-icon-button" 
                        onClick={() => updateQuantity(item.id, item.quantity - 1)} 
                        type="button"
                        disabled={item.quantity <= 1}
                      >
                        -
                      </button>
                      <strong>{item.quantity}</strong>
                      <button 
                        className="sf-icon-button" 
                        onClick={() => updateQuantity(item.id, item.quantity + 1)} 
                        type="button"
                        disabled={item.stockQty !== undefined && item.quantity >= item.stockQty}
                      >
                        +
                      </button>
                    </div>
                    <strong>PKR {(item.price * item.quantity).toFixed(2)}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="sf-card sf-section-card" style={{ height: 'fit-content' }}>
          <h2 className="sf-section-heading" style={{ marginBottom: '1rem' }}>Order Summary</h2>
          <div className="sf-summary-block">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
              <span className="sf-muted">Subtotal</span>
              <span>PKR {subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
              <span className="sf-muted">Delivery</span>
              <span>PKR {deliveryFee}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}>
              <span>Total</span>
              <span>PKR {(subtotal + deliveryFee).toFixed(2)}</span>
            </div>
          </div>

          {items.length > 0 && (
            <div className="sf-summary-block" style={{ marginTop: '1rem' }}>
              <InteractionBadge
                level={ddiLoading ? 'checking' : ddiPresentation.level}
                text={
                  ddiLoading
                    ? 'Checking drug interactions...'
                    : ddiPresentation.text
                }
              />
              {!ddiLoading && ddiPresentation.allowedWarning && (
                <p className="sf-muted" style={{ fontSize: '0.9rem', marginBottom: 0, marginTop: '0.65rem' }}>
                  {ddiPresentation.detail}
                </p>
              )}
            </div>
          )}

          {prescriptionItems.length > 0 && (
            <div className="sf-summary-block" style={{ marginTop: '1rem' }}>
              <div className="sf-badge-warning" style={{ marginBottom: '0.6rem' }}>
                <ShieldAlert size={14} />
                Prescription-required items in cart
              </div>
              <p className="sf-muted" style={{ fontSize: '0.9rem', marginBottom: '0.9rem' }}>
                Upload a prescription during checkout or from the prescription page before dispatch.
              </p>
              <Link className="sf-link" to="/prescription/upload">Upload prescription</Link>
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.65rem', marginTop: '1rem' }}>
            <button className="sf-button-secondary" onClick={() => setShowWarnings(true)} type="button">
              Review Interaction Check
            </button>
              {harmfulProductIds.length > 0 && (
                <div
                  style={{
                    marginTop: '0.9rem',
                    padding: '0.9rem',
                    border: '1px solid #f59e0b',
                    borderRadius: '10px',
                    background: '#fffbeb',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <ShieldAlert size={17} />

                    <strong>
                      Governed alternative review
                    </strong>
                  </div>

                  <p
                    style={{
                      margin:
                        '0 0 0.7rem',
                      fontSize:
                        '0.82rem',
                      lineHeight:
                        1.45,
                    }}
                  >
                    Only pharmacy-approved alternative mappings can be checked here.
                    The system does not infer substitutes from brand, category, salt similarity,
                    or AI model scores.
                  </p>

                  <div
                    style={{
                      display:
                        'flex',
                      flexWrap:
                        'wrap',
                      gap:
                        '0.5rem',
                    }}
                  >
                    {harmfulProductIds.map(
                      (sourceProductId) => {
                        const item =
                          items.find(
                            (entry) =>
                              cartProductId(
                                entry
                              ) ===
                              sourceProductId
                          );

                        return (
                          <button
                            key={
                              `governed-alt-${sourceProductId}`
                            }
                            type="button"
                            className="sf-button-secondary"
                            disabled={
                              alternativeLoadingId ===
                              sourceProductId
                            }
                            onClick={() =>
                              handleGovernedAlternativeCheck(
                                sourceProductId
                              )
                            }
                          >
                            {alternativeLoadingId ===
                            sourceProductId
                              ? 'Checking...'
                              : `Check alternative for ${
                                  item?.name ||
                                  item?.title ||
                                  `Product ${sourceProductId}`
                                }`}
                          </button>
                        );
                      }
                    )}
                  </div>

                  {alternativeError && (
                    <div
                      className="sf-badge-warning"
                      style={{
                        marginTop:
                          '0.75rem',
                      }}
                    >
                      {alternativeError}
                    </div>
                  )}

                  {visibleAlternativeReview && (
                    <div
                      style={{
                        marginTop:
                          '0.8rem',
                        padding:
                          '0.75rem',
                        background:
                          '#fff',
                        borderRadius:
                          '8px',
                        border:
                          '1px solid #e5e7eb',
                      }}
                    >
                      <strong>
                        {visibleAlternativeReview
                          .result
                          .status ===
                        'INTERACTION_CHECKED_ALTERNATIVES_AVAILABLE'
                          ? 'Interaction-checked governed candidate available'
                          : 'Pharmacist review required'}
                      </strong>

                      <p
                        style={{
                          margin:
                            '0.35rem 0 0',
                          fontSize:
                            '0.82rem',
                          lineHeight:
                            1.45,
                        }}
                      >
                        {
                          visibleAlternativeReview
                            .result
                            .message
                        }
                      </p>

                      {visibleAlternativeReview
                        .result
                        .recommendations
                        ?.length > 0 && (
                        <div
                          style={{
                            marginTop:
                              '0.7rem',
                          }}
                        >
                          {visibleAlternativeReview
                            .result
                            .recommendations
                            .map(
                              (
                                candidate
                              ) => (
                                <div
                                  key={
                                    candidate.id ||
                                    candidate.product_id
                                  }
                                  style={{
                                    padding:
                                      '0.6rem 0',
                                    borderTop:
                                      '1px solid #e5e7eb',
                                  }}
                                >
                                  <strong>
                                    {
                                      candidate.name ||
                                      candidate.title ||
                                      candidate.genericName ||
                                      'Governed candidate'
                                    }
                                  </strong>

                                  <div
                                    style={{
                                      fontSize:
                                        '0.78rem',
                                      marginTop:
                                        '0.2rem',
                                    }}
                                  >
                                    DDI re-check: CLEAR
                                    {' · '}
                                    Pharmacist confirmation required
                                  </div>
                                </div>
                              )
                            )}
                        </div>
                      )}

                      <p
                        style={{
                          margin:
                            '0.65rem 0 0',
                          fontSize:
                            '0.75rem',
                          color:
                            '#6b7280',
                        }}
                      >
                        No medicine is replaced or added automatically. Any actual substitution still requires pharmacist confirmation.
                      </p>
                    </div>
                  )}
                </div>
              )}
            {items.length > 0 && !ddiLoading && !ddiCheckoutAllowed && (
              <button
                className="sf-button-secondary"
                onClick={() => setShowEscalation(true)}
                type="button"
              >
                Escalate to Pharmacist
              </button>
            )}
            {ddiLoading ? (
              <button
                aria-disabled="true"
                className="sf-button-secondary"
                disabled
                style={{ opacity: 0.45, cursor: 'not-allowed' }}
                type="button"
              >
                Checking DDI...
              </button>
            ) : (
              <Link
                className="sf-button"
                style={{ textAlign: 'center', textDecoration: 'none' }}
                to="/checkout"
              >
                {ddiCheckoutAllowed
                  ? 'Continue to Checkout'
                  : 'Continue to Pharmacist Review'}{' '}
                <ArrowRight size={15} style={{ marginLeft: 4, verticalAlign: 'text-bottom' }} />
              </Link>
            )}
          </div>
        </aside>
      </div>

      <InteractionWarningModal isOpen={showWarnings} onClose={() => setShowWarnings(false)} warnings={ddiWarnings} />
      <EscalateToPharmacistModal
        isOpen={showEscalation}
        items={items}
        onClose={() => setShowEscalation(false)}
      />
    </div>
  );
}
