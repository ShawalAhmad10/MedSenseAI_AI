import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  CheckCircle2,
  Clock3,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react';

import {
  consultationService,
} from '../../services/consultationService';

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

function reviewTitle(
  consultation
) {
  if (
    consultation?.ddi_status ===
    'WARNING_REVIEW_REQUIRED'
  ) {
    return 'Interaction warning review';
  }

  if (
    consultation?.ddi_status ===
    'UNRESOLVED_REVIEW_REQUIRED'
  ) {
    return 'Ingredient identity review';
  }

  return 'Medicine safety review';
}

export default function Consultations() {
  const [queue, setQueue] =
    useState([]);

  const [activeId, setActiveId] =
    useState(null);

  const [guidance, setGuidance] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [error, setError] =
    useState('');

  const loadQueue =
    useCallback(
      async ({
        silent = false,
      } = {}) => {
        if (!silent) {
          setLoading(true);
        }

        setError('');

        try {
          const rows =
            await consultationService
              .getQueue(100);

          setQueue(
            rows
          );

          setActiveId(
            (current) => {
              if (
                current &&
                rows.some(
                  (row) =>
                    row.consultation_id ===
                    current
                )
              ) {
                return current;
              }

              const pending =
                rows.find(
                  (row) =>
                    row.status ===
                    'pending'
                );

              return (
                pending
                  ?.consultation_id ||
                rows[0]
                  ?.consultation_id ||
                null
              );
            }
          );
        } catch (requestError) {
          setError(
            requestError?.response?.data?.message ||
            requestError?.message ||
            'Consultation queue could not be loaded.'
          );
        } finally {
          if (!silent) {
            setLoading(false);
          }
        }
      },
      []
    );

  useEffect(() => {
    loadQueue();

    const timer =
      window.setInterval(
        () => {
          loadQueue({
            silent:
              true,
          });
        },
        15000
      );

    return () =>
      window.clearInterval(
        timer
      );
  }, [loadQueue]);

  const activeConsultation =
    useMemo(
      () =>
        queue.find(
          (item) =>
            item.consultation_id ===
            activeId
        ) ||
        null,
      [
        activeId,
        queue,
      ]
    );

  useEffect(() => {
    setGuidance('');
  }, [activeId]);

  const pendingCount =
    queue.filter(
      (item) =>
        item.status ===
        'pending'
    ).length;

  const handleGuidance =
    async () => {
      if (
        !activeConsultation ||
        activeConsultation.status !==
          'pending'
      ) {
        return;
      }

      const trimmed =
        guidance.trim();

      if (!trimmed) {
        setError(
          'Enter pharmacist guidance before submitting.'
        );

        return;
      }

      setSubmitting(true);
      setError('');

      try {
        const updated =
          await consultationService
            .addGuidance(
              activeConsultation
                .consultation_id,
              trimmed
            );

        setQueue(
          (current) =>
            current.map(
              (row) =>
                row.consultation_id ===
                updated
                  .consultation_id
                  ? {
                      ...row,
                      ...updated,
                    }
                  : row
            )
        );

        setGuidance('');
      } catch (requestError) {
        setError(
          requestError?.response?.data?.message ||
          requestError?.message ||
          'Guidance could not be saved.'
        );
      } finally {
        setSubmitting(false);
      }
    };

  return (
    <div
      style={{
        minHeight:
          'calc(100vh - 64px)',
        background:
          'var(--dash-bg)',
        padding:
          '1.25rem',
      }}
    >
      <div
        style={{
          maxWidth:
            1400,
          margin:
            '0 auto',
        }}
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
            marginBottom:
              '1rem',
            flexWrap:
              'wrap',
          }}
        >
          <div>
            <h1
              style={{
                margin:
                  0,
                color:
                  'var(--navy)',
              }}
            >
              Pharmacist Consultations
            </h1>

            <p
              style={{
                color:
                  'var(--gray-400)',
                marginBottom:
                  0,
              }}
            >
              Real EUC-08 queue for governed medicine-interaction guidance.
            </p>
          </div>

          <button
            onClick={() =>
              loadQueue()
            }
            disabled={loading}
            style={{
              display:
                'flex',
              alignItems:
                'center',
              gap:
                8,
              border:
                '1px solid var(--dash-border)',
              background:
                'white',
              borderRadius:
                10,
              padding:
                '0.7rem 1rem',
              cursor:
                'pointer',
            }}
            type="button"
          >
            <RefreshCw
              size={16}
            />

            Refresh
          </button>
        </div>

        <div
          style={{
            display:
              'grid',
            gridTemplateColumns:
              'minmax(280px, 340px) minmax(0, 1fr)',
            gap:
              '1rem',
            alignItems:
              'start',
          }}
        >
          <aside
            style={{
              background:
                'white',
              border:
                '1px solid var(--dash-border)',
              borderRadius:
                14,
              overflow:
                'hidden',
            }}
          >
            <div
              style={{
                padding:
                  '1rem',
                borderBottom:
                  '1px solid var(--dash-border)',
              }}
            >
              <strong>
                Consultation Queue
              </strong>

              <div
                style={{
                  display:
                    'flex',
                  gap:
                    '0.5rem',
                  marginTop:
                    '0.6rem',
                  flexWrap:
                    'wrap',
                }}
              >
                <span
                  style={{
                    fontSize:
                      12,
                    background:
                      'var(--amber-light)',
                    padding:
                      '4px 8px',
                    borderRadius:
                      999,
                  }}
                >
                  {pendingCount} pending
                </span>

                <span
                  style={{
                    fontSize:
                      12,
                    background:
                      'var(--dash-bg)',
                    padding:
                      '4px 8px',
                    borderRadius:
                      999,
                  }}
                >
                  {queue.length} total
                </span>
              </div>
            </div>

            {loading && (
              <div
                style={{
                  padding:
                    '1rem',
                  color:
                    'var(--gray-400)',
                }}
              >
                Loading real consultation queue...
              </div>
            )}

            {!loading &&
              queue.length ===
                0 && (
                <div
                  style={{
                    padding:
                      '1.5rem',
                    textAlign:
                      'center',
                    color:
                      'var(--gray-400)',
                  }}
                >
                  No consultations in queue.
                </div>
              )}

            <div
              style={{
                maxHeight:
                  '70vh',
                overflowY:
                  'auto',
              }}
            >
              {queue.map(
                (item) => {
                  const active =
                    activeId ===
                    item.consultation_id;

                  const pending =
                    item.status ===
                    'pending';

                  return (
                    <button
                      key={
                        item.consultation_id
                      }
                      onClick={() =>
                        setActiveId(
                          item.consultation_id
                        )
                      }
                      style={{
                        width:
                          '100%',
                        textAlign:
                          'left',
                        border:
                          'none',
                        borderBottom:
                          '1px solid var(--dash-border)',
                        background:
                          active
                            ? 'rgba(37, 99, 235, 0.08)'
                            : 'white',
                        padding:
                          '0.9rem 1rem',
                        cursor:
                          'pointer',
                      }}
                      type="button"
                    >
                      <div
                        style={{
                          display:
                            'flex',
                          justifyContent:
                            'space-between',
                          gap:
                            '0.5rem',
                        }}
                      >
                        <strong>
                          {item.customer_name ||
                            `Customer ${item.customer_id}`}
                        </strong>

                        {pending
                          ? (
                            <Clock3
                              size={15}
                            />
                            )
                          : (
                            <CheckCircle2
                              size={15}
                            />
                            )}
                      </div>

                      <div
                        style={{
                          fontSize:
                            13,
                          color:
                            'var(--gray-400)',
                          marginTop:
                            4,
                        }}
                      >
                        Consultation #
                        {
                          item.consultation_id
                        }
                      </div>

                      <div
                        style={{
                          fontSize:
                            12,
                          color:
                            pending
                              ? 'var(--amber)'
                              : 'var(--green)',
                          marginTop:
                            5,
                          fontWeight:
                            600,
                        }}
                      >
                        {pending
                          ? 'PENDING'
                          : 'RESPONDED'}
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </aside>

          <main
            style={{
              background:
                'white',
              border:
                '1px solid var(--dash-border)',
              borderRadius:
                14,
              padding:
                '1.25rem',
              minHeight:
                500,
            }}
          >
            {error && (
              <div
                style={{
                  marginBottom:
                    '1rem',
                  padding:
                    '0.8rem',
                  borderRadius:
                    10,
                  background:
                    'var(--amber-light)',
                }}
              >
                {error}
              </div>
            )}

            {!activeConsultation && (
              <div
                style={{
                  minHeight:
                    400,
                  display:
                    'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'center',
                  color:
                    'var(--gray-400)',
                }}
              >
                Select a consultation from the queue.
              </div>
            )}

            {activeConsultation && (
              <>
                <div
                  style={{
                    display:
                      'flex',
                    justifyContent:
                      'space-between',
                    gap:
                      '1rem',
                    alignItems:
                      'flex-start',
                    flexWrap:
                      'wrap',
                  }}
                >
                  <div>
                    <h2
                      style={{
                        margin:
                          0,
                        color:
                          'var(--navy)',
                      }}
                    >
                      {activeConsultation.customer_name ||
                        `Customer ${activeConsultation.customer_id}`}
                    </h2>

                    <p
                      style={{
                        color:
                          'var(--gray-400)',
                      }}
                    >
                      {reviewTitle(
                        activeConsultation
                      )}
                    </p>
                  </div>

                  <span
                    style={{
                      padding:
                        '5px 10px',
                      borderRadius:
                        999,
                      fontWeight:
                        700,
                      fontSize:
                        12,
                      background:
                        activeConsultation.status ===
                        'pending'
                          ? 'var(--amber-light)'
                          : 'var(--green-light)',
                    }}
                  >
                    {
                      activeConsultation.status
                    }
                  </span>
                </div>

                <div
                  style={{
                    display:
                      'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(180px, 1fr))',
                    gap:
                      '0.75rem',
                    margin:
                      '1rem 0',
                  }}
                >
                  <div
                    style={{
                      padding:
                        '0.8rem',
                      background:
                        'var(--dash-bg)',
                      borderRadius:
                        10,
                    }}
                  >
                    <small>
                      Consultation
                    </small>

                    <div>
                      <strong>
                        #
                        {
                          activeConsultation.consultation_id
                        }
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      padding:
                        '0.8rem',
                      background:
                        'var(--dash-bg)',
                      borderRadius:
                        10,
                    }}
                  >
                    <small>
                      Created
                    </small>

                    <div>
                      {formatDate(
                        activeConsultation.created_at
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      padding:
                        '0.8rem',
                      background:
                        'var(--dash-bg)',
                      borderRadius:
                        10,
                    }}
                  >
                    <small>
                      DDI Status
                    </small>

                    <div>
                      {
                        activeConsultation.ddi_status
                      }
                    </div>
                  </div>
                </div>

                <section>
                  <h3>
                    Medicines Reviewed
                  </h3>

                  <div
                    style={{
                      display:
                        'grid',
                      gap:
                        '0.65rem',
                    }}
                  >
                    {(activeConsultation.cart_snapshot ||
                      []).map(
                      (product) => (
                        <div
                          key={
                            product.product_id
                          }
                          style={{
                            border:
                              '1px solid var(--dash-border)',
                            borderRadius:
                              10,
                            padding:
                              '0.75rem',
                          }}
                        >
                          <strong>
                            {product.product_title ||
                              `Product ${product.product_id}`}
                          </strong>

                          <div
                            style={{
                              color:
                                'var(--gray-400)',
                              marginTop:
                                4,
                            }}
                          >
                            {product.product_salt ||
                              product.product_generic_name ||
                              'Ingredient not resolved'}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </section>

                <section
                  style={{
                    marginTop:
                      '1.25rem',
                  }}
                >
                  <h3>
                    Governed Interaction Review
                  </h3>

                  <div
                    style={{
                      display:
                        'grid',
                      gap:
                        '0.65rem',
                    }}
                  >
                    {(activeConsultation.interaction_details ||
                      []).map(
                      (
                        item,
                        index
                      ) => (
                        <div
                          key={index}
                          style={{
                            border:
                              '1px solid var(--dash-border)',
                            borderRadius:
                              10,
                            padding:
                              '0.8rem',
                          }}
                        >
                          <div
                            style={{
                              display:
                                'flex',
                              alignItems:
                                'center',
                              gap:
                                7,
                            }}
                          >
                            <ShieldAlert
                              size={16}
                            />

                            <strong>
                              {item.label ||
                                'Review required'}
                            </strong>
                          </div>

                          {(item.substance_a ||
                            item.substance_b) && (
                            <p
                              style={{
                                marginBottom:
                                  '0.35rem',
                              }}
                            >
                              {item.substance_a ||
                                'Unknown'}
                              {' + '}
                              {item.substance_b ||
                                'Unknown'}
                            </p>
                          )}

                          <p
                            style={{
                              color:
                                'var(--gray-400)',
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
                </section>

                {activeConsultation.customer_message && (
                  <section
                    style={{
                      marginTop:
                        '1.25rem',
                    }}
                  >
                    <h3>
                      Customer Message
                    </h3>

                    <p>
                      {
                        activeConsultation.customer_message
                      }
                    </p>
                  </section>
                )}

                <section
                  style={{
                    marginTop:
                      '1.25rem',
                    paddingTop:
                      '1.25rem',
                    borderTop:
                      '1px solid var(--dash-border)',
                  }}
                >
                  <h3>
                    Pharmacist Guidance
                  </h3>

                  {activeConsultation.status ===
                  'responded' ? (
                    <div
                      style={{
                        padding:
                          '1rem',
                        background:
                          'var(--green-light)',
                        borderRadius:
                          10,
                      }}
                    >
                      <p
                        style={{
                          marginTop:
                            0,
                        }}
                      >
                        {
                          activeConsultation.pharmacist_guidance
                        }
                      </p>

                      <small>
                        Responded{' '}
                        {formatDate(
                          activeConsultation.responded_at
                        )}
                      </small>
                    </div>
                  ) : (
                    <>
                      <textarea
                        maxLength={3000}
                        onChange={(event) =>
                          setGuidance(
                            event.target.value
                          )
                        }
                        placeholder="Enter factual pharmacist guidance for this verified interaction review..."
                        style={{
                          width:
                            '100%',
                          minHeight:
                            130,
                          padding:
                            '0.85rem',
                          border:
                            '1px solid var(--dash-border)',
                          borderRadius:
                            10,
                          resize:
                            'vertical',
                          boxSizing:
                            'border-box',
                        }}
                        value={guidance}
                      />

                      <button
                        disabled={
                          submitting ||
                          !guidance.trim()
                        }
                        onClick={
                          handleGuidance
                        }
                        style={{
                          marginTop:
                            '0.75rem',
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap:
                            7,
                          background:
                            'var(--navy)',
                          color:
                            'white',
                          border:
                            'none',
                          borderRadius:
                            10,
                          padding:
                            '0.75rem 1rem',
                          fontWeight:
                            700,
                          cursor:
                            'pointer',
                        }}
                        type="button"
                      >
                        <Send
                          size={16}
                        />

                        {submitting
                          ? 'Saving Guidance...'
                          : 'Send Guidance'}
                      </button>
                    </>
                  )}

                  <p
                    style={{
                      color:
                        'var(--gray-400)',
                      fontSize:
                        12,
                      marginBottom:
                        0,
                      marginTop:
                        '0.75rem',
                    }}
                  >
                    Guidance is recorded for the customer but does not bypass the governed DDI checkout gate.
                  </p>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
