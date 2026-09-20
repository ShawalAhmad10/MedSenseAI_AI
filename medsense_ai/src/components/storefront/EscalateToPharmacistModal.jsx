import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageSquareText, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import {
  createCartConsultation,
} from '../../services/storefrontConsultationService';

export default function EscalateToPharmacistModal({
  isOpen,
  onClose,
  items = [],
}) {
  const {
    isAuthenticated,
    openAuthModal,
  } = useAuth();

  const { clearCart } = useCart();

  const [requestState, setRequestState] =
    useState('idle');

  const [message, setMessage] =
    useState('');

  const [errorMessage, setErrorMessage] =
    useState('');

  const [consultation, setConsultation] =
    useState(null);

  const [duplicate, setDuplicate] =
    useState(false);

  useEffect(() => {
    if (!isOpen) {
      setRequestState('idle');
      setMessage('');
      setErrorMessage('');
      setConsultation(null);
      setDuplicate(false);
    }
  }, [isOpen]);

  const handleRequest = async () => {
    if (!isAuthenticated) {
      setRequestState('auth');
      setErrorMessage(
        'Please sign in before requesting pharmacist guidance.'
      );

      openAuthModal('account');
      return;
    }

    setRequestState(
      'submitting'
    );

    setErrorMessage('');

    try {
      const result =
        await createCartConsultation(
          items,
          message
        );

      setConsultation(
        result.consultation
      );

      setDuplicate(
        result.duplicate
      );

      setRequestState(
        'queued'
      );
    } catch (error) {
      const code =
        error?.response?.data?.code ||
        error?.code ||
        'CONSULT_REQUEST_FAILED';

      const apiMessage =
        error?.response?.data?.message ||
        error?.message ||
        'Pharmacist guidance request could not be created.';

      setErrorMessage(
        apiMessage
      );

      if (
        code ===
        'CONSULT_CART_REJECTED'
      ) {
        clearCart();

        setRequestState(
          'error'
        );

        return;
      }

      if (
        code ===
        'PHARMACIST_UNAVAILABLE'
      ) {
        setRequestState(
          'unavailable'
        );

        return;
      }

      if (
        code ===
        'DDI_SERVICE_UNAVAILABLE'
      ) {
        setRequestState(
          'ddi_unavailable'
        );

        return;
      }

      if (
        code ===
        'CONSULT_NOT_REVIEWABLE'
      ) {
        setRequestState(
          'not_reviewable'
        );

        return;
      }

      setRequestState(
        'error'
      );
    }
  };

  const isSubmitting =
    requestState ===
    'submitting';

  const isQueued =
    requestState ===
    'queued';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            animate={{ opacity: 1 }}
            className="sf-overlay"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
          />

          <div className="sf-modal-shell">
            <motion.div
              animate={{
                opacity: 1,
                y: 0,
              }}
              className="sf-card sf-modal-card"
              exit={{
                opacity: 0,
                y: 16,
              }}
              initial={{
                opacity: 0,
                y: 16,
              }}
              style={{
                width:
                  'min(100%, 560px)',
                padding:
                  '1.25rem',
              }}
            >
              <div
                style={{
                  display:
                    'flex',
                  justifyContent:
                    'space-between',
                  gap:
                    '1rem',
                }}
              >
                <div>
                  <strong
                    style={{
                      display:
                        'block',
                      fontFamily:
                        'var(--font-display)',
                      fontSize:
                        '1.2rem',
                    }}
                  >
                    Request Pharmacist Guidance
                  </strong>

                  <span className="sf-muted">
                    The server will independently verify the current cart and governed DDI result before creating a consultation.
                  </span>
                </div>

                <button
                  className="sf-icon-button"
                  onClick={onClose}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>

              <div
                className="sf-summary-block"
                style={{
                  marginTop:
                    '1rem',
                }}
              >
                <div className="sf-badge-warning">
                  <MessageSquareText
                    size={14}
                  />

                  {items.length}{' '}
                  medicine item(s) in current cart
                </div>

                <p
                  className="sf-muted"
                  style={{
                    marginBottom:
                      '0.75rem',
                    marginTop:
                      '0.75rem',
                  }}
                >
                  A pharmacist can approve or reject this exact reviewed medicine set. Any later cart change must be reviewed again before checkout.
                </p>

                <label
                  htmlFor="consultation-message"
                  style={{
                    display:
                      'block',
                    fontWeight:
                      700,
                    marginBottom:
                      '0.4rem',
                    fontSize:
                      '0.88rem',
                  }}
                >
                  Optional message
                </label>

                <textarea
                  id="consultation-message"
                  maxLength={1000}
                  onChange={(event) =>
                    setMessage(
                      event.target.value
                    )
                  }
                  placeholder="Add any question or context for the pharmacist..."
                  style={{
                    width:
                      '100%',
                    minHeight:
                      90,
                    resize:
                      'vertical',
                    border:
                      '1px solid var(--sf-border)',
                    borderRadius:
                      10,
                    padding:
                      '0.75rem',
                    boxSizing:
                      'border-box',
                  }}
                  value={message}
                />
              </div>

              {isQueued && (
                <div
                  className="sf-summary-block"
                  style={{
                    marginTop:
                      '1rem',
                  }}
                >
                  <div className="sf-badge-success">
                    Consultation queued
                  </div>

                  <p
                    className="sf-muted"
                    style={{
                      marginBottom:
                        0,
                    }}
                  >
                    {duplicate
                      ? 'An identical pending consultation already existed, so the existing request was reused.'
                      : 'Your verified interaction review has been added to the pharmacist queue.'}
                  </p>

                  {consultation?.consultation_id && (
                    <p
                      style={{
                        marginBottom:
                          0,
                      }}
                    >
                      <strong>
                        Consultation #
                        {consultation.consultation_id}
                      </strong>
                    </p>
                  )}
                </div>
              )}

              {!isQueued &&
                errorMessage && (
                  <div
                    className="sf-summary-block"
                    style={{
                      marginTop:
                        '1rem',
                    }}
                  >
                    <div className="sf-badge-warning">
                      {requestState ===
                      'unavailable'
                        ? 'Pharmacist unavailable'
                        : requestState ===
                            'ddi_unavailable'
                          ? 'DDI verification unavailable'
                          : requestState ===
                              'not_reviewable'
                            ? 'Consultation not required'
                            : 'Request not created'}
                    </div>

                    <p
                      className="sf-muted"
                      style={{
                        marginBottom:
                          0,
                        marginTop:
                          '0.65rem',
                      }}
                    >
                      {errorMessage}
                    </p>
                  </div>
                )}

              <div
                style={{
                  display:
                    'flex',
                  gap:
                    '0.65rem',
                  marginTop:
                    '1rem',
                  flexWrap:
                    'wrap',
                }}
              >
                {!isQueued && (
                  <button
                    className="sf-button"
                    disabled={
                      isSubmitting ||
                      items.length === 0
                    }
                    onClick={
                      handleRequest
                    }
                    type="button"
                  >
                    {isSubmitting
                      ? 'Verifying Cart...'
                      : 'Request Pharmacist Guidance'}
                  </button>
                )}

                <Link
                  className="sf-button-secondary"
                  onClick={onClose}
                  style={{
                    textDecoration:
                      'none',
                  }}
                  to="/consult/pharmacist"
                >
                  View Consult Status
                </Link>

                <button
                  className="sf-button-secondary"
                  onClick={onClose}
                  type="button"
                >
                  Continue Reviewing
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
