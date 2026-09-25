// SRS EUC-02: real prescription upload, OCR extraction, manual review, and confirmation.
import React, {
  useMemo,
  useState,
} from 'react';

import {
  AlertCircle,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Plus,
  UploadCloud,
} from 'lucide-react';

import {
  analyzePrescriptionFile,
  confirmPrescription,
} from '../../services/storefrontPrescriptionService';

function confidenceBadge(
  confidence
) {
  const value =
    Number(confidence);

  if (!Number.isFinite(value)) {
    return {
      className:
        'sf-badge-warning',

      text:
        'Manual entry',
    };
  }

  if (value >= 0.9) {
    return {
      className:
        'sf-badge-success',

      text:
        `${Math.round(value * 100)}%`,
    };
  }

  if (value >= 0.7) {
    return {
      className:
        'sf-badge-warning',

      text:
        `${Math.round(value * 100)}% - review`,
    };
  }

  return {
    className:
      'sf-badge-danger',

    text:
      `${Math.round(value * 100)}% - low confidence`,
  };
}

function findProductMatch(
  candidateId,
  matches
) {
  const item =
    matches.find(
      (match) =>
        match?.candidate_id ===
        candidateId
    );

  return (
    item?.product_match ||
    null
  );
}

function buildReviewRows(
  prescription
) {
  const aiResult =
    prescription?.ai_result ||
    {};

  const candidates =
    Array.isArray(
      aiResult
        ?.prescription_analysis
        ?.candidates
    )
      ? aiResult
          .prescription_analysis
          .candidates
      : [];

  const matches =
    Array.isArray(
      aiResult?.product_matches
    )
      ? aiResult.product_matches
      : [];

  if (candidates.length === 0) {
    return [
      {
        key:
          'manual-1',

        candidate_id:
          null,

        action:
          'manual',

        name:
          '',

        strength:
          '',

        originalName:
          '',

        originalStrength:
          '',

        confidence:
          null,

        reviewRequired:
          true,

        productMatch:
          null,

        isManual:
          true,
      },
    ];
  }

  return candidates.map(
    (candidate, index) => {
      const name =
        String(
          candidate?.raw_name_text ||
          ''
        );

      const strength =
        String(
          candidate?.raw_strength_text ||
          ''
        );

      return {
        key:
          candidate?.candidate_id ||
          `candidate-${index + 1}`,

        candidate_id:
          candidate?.candidate_id ||
          null,

        action:
          'confirmed',

        name,

        strength,

        originalName:
          name,

        originalStrength:
          strength,

        confidence:
          candidate?.source
            ?.confidence ?? null,

        reviewRequired:
          candidate
            ?.review_required ===
          true,

        productMatch:
          findProductMatch(
            candidate
              ?.candidate_id,
            matches
          ),

        isManual:
          false,
      };
    }
  );
}

function productMatchText(
  productMatch
) {
  if (!productMatch) {
    return 'No catalogue match';
  }

  const products =
    Array.isArray(
      productMatch.products
    )
      ? productMatch.products
      : [];

  if (
    productMatch.status ===
      'UNIQUE_CANDIDATE' &&
    products.length === 1
  ) {
    const product =
      products[0];

    return (
      product
        ?.product_generic_name ||
      product?.product_title ||
      `Product ${product?.product_id}`
    );
  }

  if (products.length > 1) {
    return (
      `${productMatch.status} - ` +
      `${products.length} possible products`
    );
  }

  return (
    productMatch.status ||
    'No catalogue match'
  );
}

export default function PrescriptionDropzone() {
  const [
    fileName,
    setFileName,
  ] = useState('');

  const [
    processing,
    setProcessing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    prescription,
    setPrescription,
  ] = useState(null);

  const [
    reviewRows,
    setReviewRows,
  ] = useState([]);

  const [
    confirmed,
    setConfirmed,
  ] = useState(false);

  const reviewCount =
    useMemo(
      () =>
        reviewRows.filter(
          (row) =>
            row.reviewRequired ||
            row.action ===
              'corrected' ||
            row.action ===
              'manual'
        ).length,
      [reviewRows]
    );

  const updateRow =
    (
      key,
      field,
      value
    ) => {
      setReviewRows(
        (current) =>
          current.map(
            (row) => {
              if (
                row.key !== key
              ) {
                return row;
              }

              const updated = {
                ...row,
                [field]:
                  value,
              };

              if (
                !updated.isManual &&
                updated.action !==
                  'rejected' &&
                (
                  updated.name !==
                    updated.originalName ||
                  updated.strength !==
                    updated.originalStrength
                )
              ) {
                updated.action =
                  'corrected';
              }

              return updated;
            }
          )
      );
    };

  const changeDecision =
    (
      key,
      action
    ) => {
      setReviewRows(
        (current) =>
          current.map(
            (row) => {
              if (
                row.key !== key ||
                row.isManual
              ) {
                return row;
              }

              if (
                action ===
                'confirmed'
              ) {
                return {
                  ...row,

                  action:
                    'confirmed',

                  name:
                    row.originalName,

                  strength:
                    row.originalStrength,
                };
              }

              return {
                ...row,
                action,
              };
            }
          )
      );
    };

  const addManualMedicine =
    () => {
      setReviewRows(
        (current) => [
          ...current,
          {
            key:
              `manual-${Date.now()}`,

            candidate_id:
              null,

            action:
              'manual',

            name:
              '',

            strength:
              '',

            originalName:
              '',

            originalStrength:
              '',

            confidence:
              null,

            reviewRequired:
              true,

            productMatch:
              null,

            isManual:
              true,
          },
        ]
      );
    };

  const handleFileSelect =
    async (event) => {
      const selected =
        event.target
          .files?.[0];

      event.target.value =
        '';

      if (!selected) {
        return;
      }

      setError('');
      setConfirmed(false);
      setPrescription(null);
      setReviewRows([]);
      setFileName(
        selected.name
      );

      setProcessing(true);

      try {
        const result =
          await analyzePrescriptionFile(
            selected
          );

        if (
          !result ||
          !result.prescription_id
        ) {
          throw new Error(
            'Prescription service returned an invalid result.'
          );
        }

        setPrescription(
          result
        );

        setReviewRows(
          buildReviewRows(
            result
          )
        );
      } catch (requestError) {
        setError(
          requestError.message ||
          'Prescription OCR failed.'
        );

        setPrescription(null);
        setReviewRows([]);
      } finally {
        setProcessing(false);
      }
    };

  const saveConfirmation =
    async () => {
      if (
        !prescription
          ?.prescription_id ||
        saving ||
        confirmed
      ) {
        return;
      }

      const invalid =
        reviewRows.some(
          (row) =>
            row.action !==
              'rejected' &&
            !String(
              row.name || ''
            ).trim()
        );

      if (
        reviewRows.length ===
          0 ||
        invalid
      ) {
        setError(
          'Enter a medicine name for every confirmed, corrected, or manual row.'
        );

        return;
      }

      const medicines =
        reviewRows.map(
          (row) => ({
            candidate_id:
              row.candidate_id,

            action:
              row.action,

            name:
              row.action ===
                'rejected'
                ? (
                    String(
                      row.name ||
                      row.originalName ||
                      ''
                    ).trim()
                  )
                : String(
                    row.name ||
                    ''
                  ).trim(),

            strength:
              String(
                row.strength ||
                ''
              ).trim() ||
              null,
          })
        );

      setError('');
      setSaving(true);

      try {
        const result =
          await confirmPrescription(
            prescription
              .prescription_id,
            medicines
          );

        setPrescription(
          result
        );

        setConfirmed(
          result
            ?.customer_verification_status ===
          'confirmed'
        );
      } catch (requestError) {
        setError(
          requestError.message ||
          'Could not save prescription confirmation.'
        );
      } finally {
        setSaving(false);
      }
    };

  const aiResult =
    prescription
      ?.ai_result ||
    {};

  const ocr =
    aiResult
      ?.ocr_result ||
    {};

  const analysis =
    aiResult
      ?.prescription_analysis ||
    {};

  const needsReview =
    prescription
      ?.review_required ===
      true ||
    ocr?.review_required ===
      true ||
    analysis
      ?.review_required ===
      true;

  return (
    <div
      style={{
        display: 'grid',
        gap: '1rem',
      }}
    >
      <div
        className="sf-card sf-section-card"
        style={{
          borderStyle:
            'dashed',

          textAlign:
            'center',
        }}
      >
        <UploadCloud
          color="var(--blue)"
          size={42}
        />

        <h3
          style={{
            marginBottom:
              '0.35rem',

            fontFamily:
              'var(--font-display)',
          }}
        >
          Upload prescription image
        </h3>

        <p
          className="sf-muted"
          style={{
            marginTop: 0,
          }}
        >
          PNG, JPG, or JPEG only.
          Maximum file size 5 MB.
        </p>

        <input
          accept=".png,.jpg,.jpeg,image/png,image/jpeg"
          disabled={
            processing ||
            saving
          }
          onChange={
            handleFileSelect
          }
          style={{
            marginTop:
              '0.65rem',
          }}
          type="file"
        />

        {fileName && (
          <div
            className="sf-badge-success"
            style={{
              marginTop:
                '0.9rem',
            }}
          >
            <FileText
              size={14}
            />

            {fileName}
          </div>
        )}
      </div>

      {error && (
        <div
          className="sf-card sf-section-card"
          style={{
            border:
              '1px solid rgba(239,68,68,0.35)',
          }}
        >
          <div
            style={{
              display:
                'flex',

              alignItems:
                'center',

              gap:
                '0.55rem',
            }}
          >
            <AlertCircle
              color="#dc2626"
              size={18}
            />

            <strong>
              Prescription review needs attention
            </strong>
          </div>

          <p
            className="sf-muted"
            style={{
              marginBottom: 0,
            }}
          >
            {error}
          </p>
        </div>
      )}

      {processing && (
        <div
          className="sf-card sf-section-card sf-loading"
        >
          <LoaderCircle
            size={26}
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
            Running real OCR and
            matching extracted
            medicines with the
            pharmacy catalogue...
          </div>
        </div>
      )}

      {prescription && (
        <>
          <div
            className="sf-card sf-section-card"
          >
            <div
              className="sf-page-header"
            >
              <div>
                <h2>
                  OCR Result
                </h2>

                <p
                  className="sf-section-subcopy"
                  style={{
                    marginBottom: 0,
                  }}
                >
                  Review the AI extraction before confirming it.
                </p>
              </div>

              <div
                className={
                  needsReview
                    ? 'sf-badge-warning'
                    : 'sf-badge-success'
                }
              >
                {needsReview
                  ? 'Manual review required'
                  : 'OCR completed'}
              </div>
            </div>

            <div
              style={{
                display:
                  'flex',

                gap:
                  '0.6rem',

                flexWrap:
                  'wrap',

                marginBottom:
                  '1rem',
              }}
            >
              <span
                className={
                  ocr.status ===
                    'SUCCESS'
                    ? 'sf-badge-success'
                    : 'sf-badge-warning'
                }
              >
                OCR: {ocr.status || prescription.ocr_status}
              </span>

              <span
                className={
                  analysis.status ===
                    'ANALYZED'
                    ? 'sf-badge-success'
                    : 'sf-badge-warning'
                }
              >
                Analysis: {analysis.status || prescription.analysis_status}
              </span>

              <span
                className={
                  prescription.customer_verification_status ===
                    'confirmed'
                    ? 'sf-badge-success'
                    : 'sf-badge-warning'
                }
              >
                Customer review: {prescription.customer_verification_status}
              </span>
            </div>

            <strong>
              Original OCR text
            </strong>

            <pre
              style={{
                whiteSpace:
                  'pre-wrap',

                padding:
                  '0.9rem',

                marginBottom:
                  0,

                borderRadius:
                  12,

                background:
                  'var(--sf-surface-alt)',

                fontFamily:
                  'inherit',
              }}
            >
              {ocr.raw_text ||
                prescription.raw_ocr_text ||
                'No reliable OCR text was extracted. Enter the medicines manually below.'}
            </pre>
          </div>

          <div
            className="sf-card sf-section-card"
          >
            <div
              className="sf-page-header"
            >
              <div>
                <h2>
                  Medicine Review
                </h2>

                <p
                  className="sf-section-subcopy"
                  style={{
                    marginBottom: 0,
                  }}
                >
                  Confirm, correct, reject, or manually enter each medicine.
                  Catalogue matches are suggestions only.
                </p>
              </div>

              <div
                className={
                  reviewCount
                    ? 'sf-badge-warning'
                    : 'sf-badge-success'
                }
              >
                {reviewCount
                  ? `${reviewCount} row(s) need attention`
                  : 'Ready for confirmation'}
              </div>
            </div>

            <div
              style={{
                overflowX:
                  'auto',
              }}
            >
              <table
                style={{
                  width:
                    '100%',

                  borderCollapse:
                    'collapse',
                }}
              >
                <thead>
                  <tr
                    style={{
                      textAlign:
                        'left',

                      color:
                        'var(--sf-text-muted)',
                    }}
                  >
                    <th
                      style={{
                        padding:
                          '0.8rem 0.45rem',
                      }}
                    >
                      Medicine
                    </th>

                    <th
                      style={{
                        padding:
                          '0.8rem 0.45rem',
                      }}
                    >
                      Strength
                    </th>

                    <th
                      style={{
                        padding:
                          '0.8rem 0.45rem',
                      }}
                    >
                      Confidence
                    </th>

                    <th
                      style={{
                        padding:
                          '0.8rem 0.45rem',
                      }}
                    >
                      Catalogue suggestion
                    </th>

                    <th
                      style={{
                        padding:
                          '0.8rem 0.45rem',
                      }}
                    >
                      Decision
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {reviewRows.map(
                    (row) => {
                      const badge =
                        confidenceBadge(
                          row.confidence
                        );

                      return (
                        <tr
                          key={
                            row.key
                          }
                          style={{
                            borderTop:
                              '1px solid var(--sf-border)',
                          }}
                        >
                          <td
                            style={{
                              minWidth:
                                180,

                              padding:
                                '0.8rem 0.45rem',
                            }}
                          >
                            <input
                              className="sf-input"
                              disabled={
                                confirmed ||
                                row.action ===
                                  'rejected'
                              }
                              onChange={
                                (event) =>
                                  updateRow(
                                    row.key,
                                    'name',
                                    event.target.value
                                  )
                              }
                              placeholder="Medicine name"
                              value={
                                row.name
                              }
                            />
                          </td>

                          <td
                            style={{
                              minWidth:
                                140,

                              padding:
                                '0.8rem 0.45rem',
                            }}
                          >
                            <input
                              className="sf-input"
                              disabled={
                                confirmed ||
                                row.action ===
                                  'rejected'
                              }
                              onChange={
                                (event) =>
                                  updateRow(
                                    row.key,
                                    'strength',
                                    event.target.value
                                  )
                              }
                              placeholder="e.g. 500 MG"
                              value={
                                row.strength
                              }
                            />
                          </td>

                          <td
                            style={{
                              padding:
                                '0.8rem 0.45rem',
                            }}
                          >
                            <span
                              className={
                                badge.className
                              }
                            >
                              {badge.text}
                            </span>
                          </td>

                          <td
                            style={{
                              minWidth:
                                180,

                              padding:
                                '0.8rem 0.45rem',
                            }}
                          >
                            <strong
                              style={{
                                display:
                                  'block',
                              }}
                            >
                              {productMatchText(
                                row.productMatch
                              )}
                            </strong>

                            {row.productMatch
                              ?.status && (
                              <span
                                className="sf-muted"
                                style={{
                                  fontSize:
                                    '0.8rem',
                                }}
                              >
                                {row.productMatch.status}
                              </span>
                            )}
                          </td>

                          <td
                            style={{
                              minWidth:
                                155,

                              padding:
                                '0.8rem 0.45rem',
                            }}
                          >
                            {row.isManual ? (
                              <span
                                className="sf-badge-warning"
                              >
                                Manual entry
                              </span>
                            ) : (
                              <select
                                className="sf-input"
                                disabled={
                                  confirmed
                                }
                                onChange={
                                  (event) =>
                                    changeDecision(
                                      row.key,
                                      event.target.value
                                    )
                                }
                                value={
                                  row.action
                                }
                              >
                                <option
                                  value="confirmed"
                                >
                                  Confirm OCR
                                </option>

                                <option
                                  value="corrected"
                                >
                                  Corrected
                                </option>

                                <option
                                  value="rejected"
                                >
                                  Reject line
                                </option>
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>

            {!confirmed && (
              <div
                style={{
                  display:
                    'flex',

                  gap:
                    '0.75rem',

                  flexWrap:
                    'wrap',

                  marginTop:
                    '1rem',
                }}
              >
                <button
                  className="sf-button-secondary"
                  disabled={
                    saving
                  }
                  onClick={
                    addManualMedicine
                  }
                  type="button"
                >
                  <Plus
                    size={16}
                  />
                  Add medicine manually
                </button>

                <button
                  className="sf-button"
                  disabled={
                    saving ||
                    processing
                  }
                  onClick={
                    saveConfirmation
                  }
                  type="button"
                >
                  {saving ? (
                    <>
                      <LoaderCircle
                        size={16}
                        style={{
                          animation:
                            'clockTick 1s linear infinite',
                        }}
                      />
                      Saving review...
                    </>
                  ) : (
                    'Confirm reviewed medicines'
                  )}
                </button>
              </div>
            )}

            {confirmed && (
              <div
                className="sf-badge-success"
                style={{
                  marginTop:
                    '1rem',

                  width:
                    'fit-content',
                }}
              >
                <CheckCircle2
                  size={16}
                />
                Prescription review saved
              </div>
            )}

            <p
              className="sf-muted"
              style={{
                marginBottom: 0,
                marginTop:
                  '1rem',
              }}
            >
              Confirming OCR does not add medicines to your cart and does not bypass drug-interaction checks.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
