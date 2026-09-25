// SRS EUC-02: real customer prescription history and OCR verification trail.
import React, {
  useEffect,
  useState,
} from 'react';

import {
  Link,
} from 'react-router-dom';

import {
  AlertCircle,
  FileText,
  LoaderCircle,
} from 'lucide-react';

import {
  getPrescription,
  listPrescriptions,
} from '../../services/storefrontPrescriptionService';

import {
  getPrescriptionRecommendations,
} from '../../services/storefrontRecommendationService';

import {
  useAuth,
} from '../../context/AuthContext';

function displayDate(value) {
  if (!value) {
    return 'Unknown date';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return date.toLocaleString();
}

export default function PrescriptionHistoryPage() {
  const {
    isAuthenticated,
    openAuthModal,
  } = useAuth();

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    prescriptions,
    setPrescriptions,
  ] = useState([]);

  const [
    detailById,
    setDetailById,
  ] = useState({});

  const [
    detailLoadingId,
    setDetailLoadingId,
  ] = useState(null);

  const [
    recommendationById,
    setRecommendationById,
  ] = useState({});

  const [
    recommendationLoadingId,
    setRecommendationLoadingId,
  ] = useState(null);

  const [
    recommendationErrorById,
    setRecommendationErrorById,
  ] = useState({});

  useEffect(
    () => {
      let active =
        true;

      if (
        !isAuthenticated
      ) {
        setPrescriptions([]);
        setRecommendationById({});
        setRecommendationErrorById({});
        setRecommendationLoadingId(null);
        setLoading(false);

        return () => {
          active =
            false;
        };
      }

      setLoading(true);
      setError('');

      listPrescriptions()
        .then(
          (rows) => {
            if (active) {
              setPrescriptions(
                rows
              );
            }
          }
        )
        .catch(
          (requestError) => {
            if (active) {
              setError(
                requestError.message ||
                'Could not load prescription history.'
              );
            }
          }
        )
        .finally(
          () => {
            if (active) {
              setLoading(false);
            }
          }
        );

      return () => {
        active =
          false;
      };
    },
    [isAuthenticated]
  );

  const toggleDetails =
    async (prescriptionId) => {
      if (
        detailById[
          prescriptionId
        ]
      ) {
        setDetailById(
          (current) => {
            const next = {
              ...current,
            };

            delete next[
              prescriptionId
            ];

            return next;
          }
        );

        return;
      }

      setError('');
      setDetailLoadingId(
        prescriptionId
      );

      try {
        const detail =
          await getPrescription(
            prescriptionId
          );

        setDetailById(
          (current) => ({
            ...current,

            [prescriptionId]:
              detail,
          })
        );

        if (
          detail
            ?.customer_verification_status ===
            'confirmed' &&
          detail
            ?.confirmation_required ===
            false
        ) {
          setRecommendationLoadingId(
            prescriptionId
          );

          setRecommendationErrorById(
            (current) => ({
              ...current,
              [prescriptionId]: '',
            })
          );

          void getPrescriptionRecommendations(
            prescriptionId
          )
            .then((result) => {
              setRecommendationById(
                (current) => ({
                  ...current,
                  [prescriptionId]:
                    result,
                })
              );
            })
            .catch((requestError) => {
              setRecommendationErrorById(
                (current) => ({
                  ...current,
                  [prescriptionId]:
                    requestError.message ||
                    'Could not load prescription recommendations.',
                })
              );
            })
            .finally(() => {
              setRecommendationLoadingId(
                (current) =>
                  current ===
                  prescriptionId
                    ? null
                    : current
              );
            });
        }
      } catch (requestError) {
        setError(
          requestError.message ||
          'Could not load prescription details.'
        );
      } finally {
        setDetailLoadingId(
          null
        );
      }
    };

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
            Prescription history is account-only
          </h1>

          <button
            className="sf-button"
            onClick={
              () =>
                openAuthModal(
                  'prescription'
                )
            }
            type="button"
          >
            Sign in to view history
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
              Prescription History
            </h1>

            <p
              className="sf-section-subcopy"
              style={{
                marginBottom: 0,
              }}
            >
              Real prescription uploads, OCR status, and customer verification history.
            </p>
          </div>

          <Link
            className="sf-link"
            to="/prescription/upload"
          >
            Upload another
          </Link>
        </div>

        {error && (
          <div
            style={{
              display:
                'flex',

              gap:
                '0.55rem',

              alignItems:
                'center',

              marginBottom:
                '1rem',
            }}
          >
            <AlertCircle
              color="#dc2626"
              size={18}
            />

            <span>
              {error}
            </span>
          </div>
        )}

        {loading && (
          <div className="sf-loading">
            <LoaderCircle
              size={24}
              style={{
                animation:
                  'clockTick 1s linear infinite',
              }}
            />

            <div
              style={{
                marginTop:
                  '0.75rem',
              }}
            >
              Loading prescription history...
            </div>
          </div>
        )}

        {!loading &&
          prescriptions.length ===
            0 && (
            <div className="sf-empty">
              No prescriptions uploaded yet.
            </div>
          )}

        {!loading &&
          prescriptions.length >
            0 && (
            <div
              style={{
                display:
                  'grid',

                gap:
                  '0.9rem',
              }}
            >
              {prescriptions.map(
                (item) => {
                  const detail =
                    detailById[
                      item
                        .prescription_id
                    ];

                  const verified =
                    item
                      .customer_verification_status ===
                    'confirmed';

                  const corrections =
                    detail
                      ?.customer_corrections
                      ?.medicines;

                  const candidates =
                    detail
                      ?.ai_result
                      ?.prescription_analysis
                      ?.candidates;

                  const recommendation =
                    recommendationById[
                      item.prescription_id
                    ];

                  const recommendationError =
                    recommendationErrorById[
                      item.prescription_id
                    ] || '';

                  const recommendationLoading =
                    recommendationLoadingId ===
                    item.prescription_id;

                  return (
                    <article
                      className="sf-summary-block"
                      key={
                        item.prescription_id
                      }
                    >
                      <div
                        style={{
                          display:
                            'flex',

                          justifyContent:
                            'space-between',

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
                            <FileText
                              size={15}
                              style={{
                                marginRight:
                                  6,
                              }}
                            />

                            Prescription #{item.prescription_id}
                          </strong>

                          <span className="sf-muted">
                            {item.original_filename ||
                              'Prescription image'}
                            {' - '}
                            {displayDate(
                              item.created_at
                            )}
                          </span>
                        </div>

                        <div
                          style={{
                            display:
                              'flex',

                            gap:
                              '0.5rem',

                            flexWrap:
                              'wrap',
                          }}
                        >
                          <span
                            className={
                              item.ocr_status ===
                                'SUCCESS'
                                ? 'sf-badge-success'
                                : 'sf-badge-warning'
                            }
                          >
                            OCR: {item.ocr_status || 'Unknown'}
                          </span>

                          <span
                            className={
                              verified
                                ? 'sf-badge-success'
                                : 'sf-badge-warning'
                            }
                          >
                            {verified
                              ? 'Confirmed'
                              : 'Needs customer review'}
                          </span>
                        </div>
                      </div>

                      <button
                        className="sf-button-secondary"
                        disabled={
                          detailLoadingId ===
                          item.prescription_id
                        }
                        onClick={
                          () =>
                            toggleDetails(
                              item.prescription_id
                            )
                        }
                        style={{
                          marginTop:
                            '0.8rem',
                        }}
                        type="button"
                      >
                        {detailLoadingId ===
                        item.prescription_id
                          ? 'Loading...'
                          : detail
                            ? 'Hide details'
                            : 'View details'}
                      </button>

                      {detail && (
                        <div
                          style={{
                            display:
                              'grid',

                            gap:
                              '0.8rem',

                            marginTop:
                              '1rem',
                          }}
                        >
                          <div>
                            <strong>
                              Original OCR text
                            </strong>

                            <pre
                              style={{
                                whiteSpace:
                                  'pre-wrap',

                                padding:
                                  '0.8rem',

                                borderRadius:
                                  10,

                                background:
                                  'var(--sf-surface-alt)',

                                fontFamily:
                                  'inherit',
                              }}
                            >
                              {detail.raw_ocr_text ||
                                'No OCR text was extracted.'}
                            </pre>
                          </div>

                          {Array.isArray(
                            corrections
                          ) &&
                            corrections.length >
                              0 && (
                              <div>
                                <strong>
                                  Customer-confirmed medicines
                                </strong>

                                <div
                                  style={{
                                    display:
                                      'grid',

                                    gap:
                                      '0.45rem',

                                    marginTop:
                                      '0.55rem',
                                  }}
                                >
                                  {corrections.map(
                                    (
                                      medicine,
                                      index
                                    ) => (
                                      <div
                                        className="sf-card"
                                        key={
                                          `${medicine.candidate_id || 'manual'}-${index}`
                                        }
                                        style={{
                                          padding:
                                            '0.7rem',
                                        }}
                                      >
                                        <strong>
                                          {medicine.name ||
                                            'Rejected OCR line'}
                                        </strong>

                                        {medicine.strength && (
                                          <span className="sf-muted">
                                            {' - '}
                                            {medicine.strength}
                                          </span>
                                        )}

                                        <div>
                                          <span
                                            className={
                                              medicine.action ===
                                                'rejected'
                                                ? 'sf-badge-warning'
                                                : 'sf-badge-success'
                                            }
                                          >
                                            {medicine.action}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                          {verified && (
                            <div>
                              <strong>
                                Medicine recommendations
                              </strong>

                              <p
                                className="sf-muted"
                                style={{
                                  fontSize:
                                    '0.84rem',
                                  marginBottom:
                                    '0.55rem',
                                }}
                              >
                                Only same-ingredient catalogue matches are shown. These suggestions do not establish dose or clinical equivalence.
                              </p>

                              {recommendationLoading && (
                                <div className="sf-loading">
                                  Loading catalogue recommendations...
                                </div>
                              )}

                              {!recommendationLoading &&
                                recommendationError && (
                                  <div className="sf-badge-warning">
                                    {recommendationError}
                                  </div>
                                )}

                              {!recommendationLoading &&
                                !recommendationError &&
                                recommendation?.status ===
                                  'NO_ALTERNATIVES' && (
                                  <div className="sf-empty">
                                    No eligible same-ingredient active, in-stock alternative is currently available.
                                  </div>
                                )}

                              {!recommendationLoading &&
                                !recommendationError &&
                                Array.isArray(
                                  recommendation?.groups
                                ) &&
                                recommendation.groups.map(
                                  (group, groupIndex) => (
                                    <div
                                      className="sf-summary-block"
                                      key={
                                        group.candidate_id ||
                                        `${group.name || 'medicine'}-${groupIndex}`
                                      }
                                      style={{
                                        marginTop:
                                          '0.7rem',
                                      }}
                                    >
                                      <strong>
                                        {group.name ||
                                          'Confirmed medicine'}
                                        {group.strength
                                          ? ` ${group.strength}`
                                          : ''}
                                      </strong>

                                      {Array.isArray(
                                        group.recommendations
                                      ) &&
                                      group.recommendations.length > 0 ? (
                                        <div
                                          style={{
                                            display:
                                              'grid',
                                            gap:
                                              '0.55rem',
                                            marginTop:
                                              '0.6rem',
                                          }}
                                        >
                                          {group.recommendations.map(
                                            (product) => (
                                              <div
                                                className="sf-card"
                                                key={product.id}
                                                style={{
                                                  padding:
                                                    '0.75rem',
                                                }}
                                              >
                                                <strong>
                                                  {product.name}
                                                </strong>

                                                <div className="sf-muted">
                                                  {product.salt ||
                                                    product.genericName ||
                                                    'Ingredient not specified'}
                                                  {' - '}
                                                  {product.stockLabel}
                                                </div>

                                                <div
                                                  style={{
                                                    marginTop:
                                                      '0.45rem',
                                                  }}
                                                >
                                                  PKR {product.price}
                                                </div>

                                                <Link
                                                  className="sf-link"
                                                  to={`/product/${product.slug}`}
                                                >
                                                  View product
                                                </Link>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      ) : (
                                        <div
                                          className="sf-muted"
                                          style={{
                                            marginTop:
                                              '0.45rem',
                                          }}
                                        >
                                          No same-ingredient catalogue option is available for this confirmed medicine.
                                        </div>
                                      )}
                                    </div>
                                  )
                                )}

                              {recommendation?.limitations?.map(
                                (note, index) => (
                                  <p
                                    className="sf-muted"
                                    key={`rx-recommendation-limit-${index}`}
                                    style={{
                                      fontSize:
                                        '0.8rem',
                                      marginBottom:
                                        0,
                                      marginTop:
                                        '0.5rem',
                                    }}
                                  >
                                    {note}
                                  </p>
                                )
                              )}

                              {recommendation && (
                                <p
                                  className="sf-muted"
                                  style={{
                                    fontSize:
                                      '0.8rem',
                                    marginBottom:
                                      0,
                                    marginTop:
                                      '0.5rem',
                                  }}
                                >
                                  Opening or adding a suggested product does not bypass the cart interaction check.
                                </p>
                              )}
                            </div>
                          )}

                          {!verified &&
                            Array.isArray(
                              candidates
                            ) &&
                            candidates.length >
                              0 && (
                              <div>
                                <strong>
                                  Extracted medicines awaiting confirmation
                                </strong>

                                <div
                                  style={{
                                    marginTop:
                                      '0.45rem',
                                  }}
                                >
                                  {candidates.map(
                                    (
                                      candidate
                                    ) => (
                                      <div
                                        key={
                                          candidate.candidate_id
                                        }
                                      >
                                        {candidate.raw_name_text}
                                        {candidate.raw_strength_text
                                          ? ` ${candidate.raw_strength_text}`
                                          : ''}
                                      </div>
                                    )
                                  )}
                                </div>

                                <Link
                                  className="sf-link"
                                  to="/prescription/upload"
                                >
                                  Upload/review prescription
                                </Link>
                              </div>
                            )}
                        </div>
                      )}
                    </article>
                  );
                }
              )}
            </div>
          )}
      </div>
    </div>
  );
}
