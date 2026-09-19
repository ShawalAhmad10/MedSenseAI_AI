import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { Link } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';

import {
  listCustomerConsultations,
} from '../../services/storefrontConsultationService';

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—';
  }

  return date.toLocaleString();
}

function consultationTitle(item) {
  if (
    item?.ddi_status ===
    'WARNING_REVIEW_REQUIRED'
  ) {
    return 'Interaction warning review';
  }

  if (
    item?.ddi_status ===
    'UNRESOLVED_REVIEW_REQUIRED'
  ) {
    return 'Ingredient identity review';
  }

  return 'Medicine safety review';
}

export default function PharmacistConsultPage() {
  const {
    isAuthenticated,
    openAuthModal,
  } = useAuth();

  const [consultations, setConsultations] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const loadConsultations =
    useCallback(
      async () => {
        if (!isAuthenticated) {
          return;
        }

        setLoading(true);
        setError('');

        try {
          const rows =
            await listCustomerConsultations();

          setConsultations(
            rows
          );
        } catch (requestError) {
          setError(
            requestError?.response?.data?.message ||
            requestError?.message ||
            'Consultations could not be loaded.'
          );
        } finally {
          setLoading(false);
        }
      },
      [isAuthenticated]
    );

  useEffect(() => {
    loadConsultations();
  }, [loadConsultations]);

  if (!isAuthenticated) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1
            style={{
              fontFamily:
                'var(--font-display)',
            }}
          >
            Pharmacist Consult
          </h1>

          <p className="sf-muted">
            Sign in to view your real pharmacist consultation requests and guidance.
          </p>

          <button
            className="sf-button"
            onClick={() =>
              openAuthModal(
                'account'
              )
            }
            type="button"
          >
            Sign in to view consults
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="storefront-shell">
      <div className="sf-card sf-section-card">
        <div className="sf-page-header">
          <div>
            <h1>
              Pharmacist Consult
            </h1>

            <p
              className="sf-section-subcopy"
              style={{
                marginBottom:
                  0,
              }}
            >
              Verified medicine-safety consultation requests and pharmacist guidance linked to your account.
            </p>
          </div>

          <button
            className="sf-button-secondary"
            disabled={loading}
            onClick={
              loadConsultations
            }
            type="button"
          >
            {loading
              ? 'Refreshing...'
              : 'Refresh'}
          </button>
        </div>

        {error && (
          <div
            className="sf-summary-block"
            style={{
              marginBottom:
                '1rem',
            }}
          >
            <div className="sf-badge-warning">
              Could not load consultations
            </div>

            <p
              className="sf-muted"
              style={{
                marginBottom:
                  0,
              }}
            >
              {error}
            </p>
          </div>
        )}

        {!loading &&
          !error &&
          consultations.length ===
            0 && (
            <div className="sf-summary-block">
              <strong>
                No pharmacist consultations yet
              </strong>

              <p className="sf-muted">
                A consultation will appear here after a governed DDI review requires pharmacist guidance and you request assistance from the cart.
              </p>

              <Link
                className="sf-button-secondary"
                style={{
                  textDecoration:
                    'none',
                }}
                to="/cart"
              >
                Back to Cart
              </Link>
            </div>
          )}

        <div
          style={{
            display:
              'grid',
            gap:
              '1rem',
          }}
        >
          {consultations.map(
            (consultation) => {
              const responded =
                consultation.status ===
                'responded';

              return (
                <article
                  className="sf-summary-block"
                  key={
                    consultation.consultation_id
                  }
                >
                  <div
                    style={{
                      display:
                        'flex',
                      justifyContent:
                        'space-between',
                      alignItems:
                        'flex-start',
                      gap:
                        '1rem',
                      flexWrap:
                        'wrap',
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          display:
                            'block',
                        }}
                      >
                        Consultation #
                        {
                          consultation.consultation_id
                        }
                      </strong>

                      <span className="sf-muted">
                        {consultationTitle(
                          consultation
                        )}
                      </span>
                    </div>

                    <span
                      className={
                        responded
                          ? 'sf-badge-success'
                          : 'sf-badge-warning'
                      }
                    >
                      {responded
                        ? 'Guidance received'
                        : 'Pending pharmacist guidance'}
                    </span>
                  </div>

                  <div
                    style={{
                      display:
                        'grid',
                      gap:
                        '0.55rem',
                      marginTop:
                        '1rem',
                    }}
                  >
                    <span className="sf-muted">
                      Requested:{' '}
                      {formatDate(
                        consultation.created_at
                      )}
                    </span>

                    <span className="sf-muted">
                      DDI status:{' '}
                      {consultation.ddi_status}
                    </span>
                  </div>

                  {Array.isArray(
                    consultation.cart_snapshot
                  ) &&
                    consultation.cart_snapshot.length >
                      0 && (
                      <div
                        style={{
                          marginTop:
                            '1rem',
                        }}
                      >
                        <strong>
                          Medicines reviewed
                        </strong>

                        <ul>
                          {consultation.cart_snapshot.map(
                            (product) => (
                              <li
                                key={
                                  product.product_id
                                }
                              >
                                {product.product_title ||
                                  `Product ${product.product_id}`}
                                {product.product_salt
                                  ? ` — ${product.product_salt}`
                                  : ''}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}

                  {Array.isArray(
                    consultation.interaction_details
                  ) &&
                    consultation.interaction_details.length >
                      0 && (
                      <div
                        style={{
                          marginTop:
                            '1rem',
                        }}
                      >
                        <strong>
                          Interaction review
                        </strong>

                        <div
                          style={{
                            display:
                              'grid',
                            gap:
                              '0.65rem',
                            marginTop:
                              '0.65rem',
                          }}
                        >
                          {consultation.interaction_details.map(
                            (
                              item,
                              index
                            ) => (
                              <div
                                className="sf-card"
                                key={`${consultation.consultation_id}-${index}`}
                                style={{
                                  padding:
                                    '0.75rem',
                                }}
                              >
                                <strong>
                                  {item.label ||
                                    'Review required'}
                                </strong>

                                {(item.substance_a ||
                                  item.substance_b) && (
                                  <div className="sf-muted">
                                    {item.substance_a ||
                                      'Unknown'}
                                    {' + '}
                                    {item.substance_b ||
                                      'Unknown'}
                                  </div>
                                )}

                                <p
                                  className="sf-muted"
                                  style={{
                                    marginBottom:
                                      0,
                                  }}
                                >
                                  {item.message}
                                </p>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}

                  {consultation.customer_message && (
                    <div
                      style={{
                        marginTop:
                          '1rem',
                      }}
                    >
                      <strong>
                        Your message
                      </strong>

                      <p className="sf-muted">
                        {
                          consultation.customer_message
                        }
                      </p>
                    </div>
                  )}

                  <div
                    className="sf-summary-block"
                    style={{
                      marginTop:
                        '1rem',
                    }}
                  >
                    <strong>
                      Pharmacist guidance
                    </strong>

                    <p
                      style={{
                        marginBottom:
                          0,
                      }}
                    >
                      {responded
                        ? consultation.pharmacist_guidance
                        : 'Waiting for an active approved pharmacist to review this consultation.'}
                    </p>

                    {responded &&
                      consultation.responded_at && (
                        <span
                          className="sf-muted"
                          style={{
                            display:
                              'block',
                            marginTop:
                              '0.55rem',
                          }}
                        >
                          Responded:{' '}
                          {formatDate(
                            consultation.responded_at
                          )}
                        </span>
                      )}
                  </div>

                  <p
                    className="sf-muted"
                    style={{
                      marginBottom:
                        0,
                      marginTop:
                        '1rem',
                      fontSize:
                        '0.85rem',
                    }}
                  >
                    Pharmacist guidance does not override the governed DDI checkout decision.
                  </p>
                </article>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
