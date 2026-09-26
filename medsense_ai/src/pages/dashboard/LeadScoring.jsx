import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Database,
  Download,
  Info,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';

import api from '../../services/api';

const STATUS_META = {
  scored: {
    label: 'Scored',
    color: '#10b981',
    background: '#ecfdf5',
    description: 'Verified model score is available.',
  },
  insufficient_data: {
    label: 'Insufficient Data',
    color: '#d97706',
    background: '#fffbeb',
    description:
      'Required historical coverage is not complete enough to score safely.',
  },
  model_unavailable: {
    label: 'Model Unavailable',
    color: '#dc2626',
    background: '#fef2f2',
    description:
      'A verified compatible model runtime is not currently available.',
  },
  out_of_scope: {
    label: 'Out of Scope',
    color: '#64748b',
    background: '#f8fafc',
    description:
      'The customer does not currently satisfy the model scope.',
  },
  invalid_input: {
    label: 'Input Unavailable',
    color: '#7c3aed',
    background: '#faf5ff',
    description:
      'Canonical scoring input could not be validated.',
  },
};

const FILTERS = [
  { id: 'all', label: 'All Customers' },
  { id: 'scored', label: 'Scored' },
  { id: 'insufficient_data', label: 'Insufficient Data' },
  { id: 'model_unavailable', label: 'Model Unavailable' },
];

function statusMeta(status) {
  return (
    STATUS_META[status] || {
      label: status
        ? status
            .replaceAll('_', ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Unknown',
      color: '#64748b',
      background: '#f8fafc',
      description: 'No additional status description is available.',
    }
  );
}

function reasonText(reason) {
  if (!reason) return '—';

  const known = {
    historical_coverage_or_availability:
      'Complete historical coverage is not available yet.',
    no_known_completed_purchase_in_60d:
      'No known completed purchase exists in the required 60-day window.',
    'No verified bundle loaded':
      'Verified model bundle is unavailable in the current runtime.',
    canonical_input_validation_failed:
      'Canonical customer history could not be validated.',
    model_failure:
      'Verified model execution failed safely.',
  };

  return (
    known[reason] ||
    String(reason)
      .replaceAll('_', ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

function normalizeLead(row) {
  const scoring = row?.scoring || {};

  const rawScore = Number(scoring.lead_score);
  const rawProbability = Number(scoring.model_probability);

  return {
    id: Number(row?.customer_id),
    name:
      row?.customer_name ||
      `Customer #${row?.customer_id ?? '—'}`,
    email: row?.email || '—',
    orderCount: Number(row?.order_count || 0),
    status: scoring.status || 'invalid_input',
    reason: scoring.reason || null,
    score:
      scoring.lead_score !== null &&
      scoring.lead_score !== undefined &&
      Number.isFinite(rawScore)
        ? rawScore
        : null,
    probability:
      scoring.model_probability !== null &&
      scoring.model_probability !== undefined &&
      Number.isFinite(rawProbability)
        ? rawProbability
        : null,
    modelVersion: scoring.model_version || null,
    featureVersion: scoring.feature_version || null,
    sourceNamespace: scoring.source_namespace || null,
    observationTime: scoring.observation_time || null,
    notice: scoring.synthetic_development_notice || null,
  };
}

function StatCard({
  icon,
  label,
  value,
  helper,
  color = 'var(--navy)',
}) {
  return (
    <div
      style={{
        background: 'white',
        borderRadius: 'var(--dash-radius)',
        padding: '1.2rem',
        border: '1px solid var(--dash-border)',
        boxShadow: 'var(--dash-shadow)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: '0.55rem',
          color,
          fontSize: '0.72rem',
          fontWeight: 700,
          textTransform: 'uppercase',
        }}
      >
        {icon}
        {label}
      </div>

      <div
        style={{
          fontFamily: 'var(--font-display)',
          color: 'var(--navy)',
          fontSize: '1.55rem',
          fontWeight: 800,
        }}
      >
        {value}
      </div>

      {helper && (
        <div
          style={{
            marginTop: 4,
            fontSize: '0.7rem',
            color: 'var(--gray-400)',
          }}
        >
          {helper}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const meta = statusMeta(status);

  return (
    <span
      title={meta.description}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderRadius: 100,
        fontSize: '0.72rem',
        fontWeight: 700,
        color: meta.color,
        background: meta.background,
        border: `1px solid ${meta.color}22`,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: meta.color,
        }}
      />
      {meta.label}
    </span>
  );
}

function csvValue(value) {
  const text =
    value === null || value === undefined
      ? ''
      : String(value);

  return `"${text.replaceAll('"', '""')}"`;
}

export default function LeadScoring() {
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortField, setSortField] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [runtimeMeta, setRuntimeMeta] = useState({
    refreshMode: null,
    persistedScores: false,
  });

  const applyResponse = useCallback((response) => {
    const data = response?.data?.data || {};
    const rows = Array.isArray(data.leads)
      ? data.leads
      : [];

    setLeads(rows.map(normalizeLead));

    setRuntimeMeta({
      refreshMode: data.refresh_mode || null,
      persistedScores: data.persisted_scores === true,
    });

    setLastRefresh(new Date());
  }, []);

  const load = useCallback(
    async (refresh = false) => {
      setError('');

      if (refresh) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const response = refresh
          ? await api.post('/leads/recalculate?limit=100')
          : await api.get('/leads?limit=100');

        applyResponse(response);
      } catch (err) {
        console.error(
          'Real lead scoring load failed:',
          err,
        );

        setLeads([]);

        setRuntimeMeta({
          refreshMode: null,
          persistedScores: false,
        });

        setLastRefresh(null);

        setError(
          err?.response?.data?.message ||
            'Lead scoring data is currently unavailable.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [applyResponse],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const counts = useMemo(() => {
    return {
      total: leads.length,
      scored: leads.filter(
        (lead) => lead.status === 'scored',
      ).length,
      insufficient: leads.filter(
        (lead) =>
          lead.status === 'insufficient_data',
      ).length,
      unavailable: leads.filter(
        (lead) =>
          lead.status === 'model_unavailable',
      ).length,
    };
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const filtered =
      activeFilter === 'all'
        ? [...leads]
        : leads.filter(
            (lead) =>
              lead.status === activeFilter,
          );

    return filtered.sort((a, b) => {
      let left = a[sortField];
      let right = b[sortField];

      if (sortField === 'score') {
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
      }

      if (
        typeof left === 'string' &&
        typeof right === 'string'
      ) {
        const comparison =
          left.localeCompare(right);

        return sortOrder === 'asc'
          ? comparison
          : -comparison;
      }

      left = left ?? 0;
      right = right ?? 0;

      if (left === right) return 0;

      return sortOrder === 'asc'
        ? left - right
        : right - left;
    });
  }, [
    leads,
    activeFilter,
    sortField,
    sortOrder,
  ]);

  const firstNotice = useMemo(
    () =>
      leads.find((lead) => lead.notice)
        ?.notice || null,
    [leads],
  );

  const featureVersion = useMemo(
    () =>
      leads.find((lead) => lead.featureVersion)
        ?.featureVersion || '—',
    [leads],
  );

  const modelVersion = useMemo(
    () =>
      leads.find((lead) => lead.modelVersion)
        ?.modelVersion || '—',
    [leads],
  );

  const setSort = (field) => {
    if (field === sortField) {
      setSortOrder((current) =>
        current === 'asc' ? 'desc' : 'asc',
      );
      return;
    }

    setSortField(field);
    setSortOrder(
      field === 'name' ? 'asc' : 'desc',
    );
  };

  const filterCount = (filter) => {
    if (filter === 'all') {
      return counts.total;
    }

    return leads.filter(
      (lead) => lead.status === filter,
    ).length;
  };

  const exportCsv = () => {
    if (leads.length === 0) return;

    const headers = [
      'customer_id',
      'customer_name',
      'email',
      'order_count',
      'status',
      'lead_score',
      'model_probability',
      'reason',
      'model_version',
      'feature_version',
      'source_namespace',
      'observation_time',
    ];

    const lines = [
      headers.map(csvValue).join(','),
      ...leads.map((lead) =>
        [
          lead.id,
          lead.name,
          lead.email,
          lead.orderCount,
          lead.status,
          lead.score,
          lead.probability,
          lead.reason,
          lead.modelVersion,
          lead.featureVersion,
          lead.sourceNamespace,
          lead.observationTime,
        ]
          .map(csvValue)
          .join(','),
      ),
    ];

    const blob = new Blob(
      [lines.join('\n')],
      {
        type: 'text/csv;charset=utf-8',
      },
    );

    const url =
      URL.createObjectURL(blob);

    const anchor =
      document.createElement('a');

    anchor.href = url;
    anchor.download =
      'medsense-real-lead-scoring.csv';

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    URL.revokeObjectURL(url);
  };

  return (
    <div
      style={{
        padding: '1.5rem',
        width: '100%',
        maxWidth: 1600,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '1.6rem',
              color: 'var(--navy)',
              margin: '0 0 3px',
            }}
          >
            AI Lead Scoring
          </h1>

          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--gray-400)',
              margin: 0,
            }}
          >
            Real customer eligibility and model
            output from authoritative pharmacy
            history.
          </p>

          {lastRefresh && (
            <p
              style={{
                fontSize: '0.7rem',
                color: 'var(--gray-400)',
                margin: '5px 0 0',
              }}
            >
              Last refreshed:{' '}
              {lastRefresh.toLocaleString()}
            </p>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '0.7rem',
          }}
        >
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={exportCsv}
            disabled={leads.length === 0}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0.55rem 0.9rem',
              borderRadius: 100,
              border:
                '1px solid var(--dash-border)',
              background: 'white',
              color: 'var(--navy)',
              cursor:
                leads.length === 0
                  ? 'not-allowed'
                  : 'pointer',
              opacity:
                leads.length === 0
                  ? 0.5
                  : 1,
              fontWeight: 600,
            }}
          >
            <Download size={14} />
            Export CSV
          </motion.button>

          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => load(true)}
            disabled={isRefreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '0.55rem 1rem',
              borderRadius: 100,
              border: 'none',
              background:
                'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
              color: 'white',
              cursor: isRefreshing
                ? 'not-allowed'
                : 'pointer',
              opacity:
                isRefreshing ? 0.75 : 1,
              fontWeight: 650,
            }}
          >
            {isRefreshing ? (
              <LoaderCircle
                size={14}
                className="spin"
              />
            ) : (
              <RefreshCw size={14} />
            )}

            {isRefreshing
              ? 'Refreshing...'
              : 'Refresh Analysis'}
          </motion.button>
        </div>
      </div>

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '0.9rem 1rem',
            marginBottom: '1rem',
            borderRadius:
              'var(--dash-radius)',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: '0.78rem',
          }}
        >
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(0, 1fr))',
          gap: '1rem',
          marginBottom: '1.2rem',
        }}
      >
        <StatCard
          icon={<Users size={15} />}
          label="Real Customers"
          value={counts.total}
          helper="Authoritative active customer records"
        />

        <StatCard
          icon={<CheckCircle2 size={15} />}
          label="Scored"
          value={counts.scored}
          helper="Canonical eligibility and model available"
          color="#10b981"
        />

        <StatCard
          icon={<Info size={15} />}
          label="Insufficient Data"
          value={counts.insufficient}
          helper="Score withheld instead of estimated"
          color="#d97706"
        />

        <StatCard
          icon={<AlertTriangle size={15} />}
          label="Model Unavailable"
          value={counts.unavailable}
          helper="Verified compatible runtime unavailable"
          color="#dc2626"
        />
      </div>

      <div
        style={{
          background: 'white',
          border:
            '1px solid var(--dash-border)',
          borderRadius:
            'var(--dash-radius)',
          boxShadow:
            'var(--dash-shadow)',
          padding: '1.1rem',
          marginBottom: '1.2rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: '0.8rem',
          }}
        >
          <ShieldCheck
            size={18}
            color="#2563eb"
          />

          <strong
            style={{
              color: 'var(--navy)',
              fontSize: '0.9rem',
            }}
          >
            Model governance
          </strong>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(4, minmax(0, 1fr))',
            gap: '0.8rem',
          }}
        >
          {[
            {
              icon: <BrainCircuit size={15} />,
              label: 'Model',
              value: modelVersion,
            },
            {
              icon: <Database size={15} />,
              label: 'Features',
              value: featureVersion,
            },
            {
              icon: <ShieldCheck size={15} />,
              label: 'Score persistence',
              value:
                runtimeMeta.persistedScores
                  ? 'Enabled'
                  : 'Disabled',
            },
            {
              icon: <Info size={15} />,
              label: 'Operational tiers',
              value: 'None defined',
            },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: '0.8rem',
                borderRadius: 10,
                background:
                  'var(--dash-bg)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color:
                    'var(--gray-400)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform:
                    'uppercase',
                  marginBottom: 5,
                }}
              >
                {item.icon}
                {item.label}
              </div>

              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--navy)',
                  fontWeight: 650,
                  wordBreak:
                    'break-word',
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: '0.85rem',
            padding: '0.75rem',
            borderRadius: 10,
            background: '#eff6ff',
            border:
              '1px solid #dbeafe',
            fontSize: '0.72rem',
            lineHeight: 1.55,
            color: '#1e3a8a',
          }}
        >
          {firstNotice ||
            'Lead status is based on canonical eligibility. No High/Medium/Low marketing tiers are inferred.'}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        {FILTERS.map((filter) => {
          const active =
            activeFilter === filter.id;

          return (
            <button
              key={filter.id}
              onClick={() =>
                setActiveFilter(
                  filter.id,
                )
              }
              style={{
                padding:
                  '0.42rem 0.9rem',
                borderRadius: 100,
                border:
                  '1px solid var(--dash-border)',
                background: active
                  ? 'var(--navy)'
                  : 'white',
                color: active
                  ? 'white'
                  : 'var(--gray-600)',
                fontSize: '0.76rem',
                fontWeight: 650,
                cursor: 'pointer',
              }}
            >
              {filter.label}{' '}
              <span
                style={{
                  opacity: 0.75,
                }}
              >
                ({filterCount(filter.id)})
              </span>
            </button>
          );
        })}
      </div>

      <div
        style={{
          background: 'white',
          borderRadius:
            'var(--dash-radius)',
          border:
            '1px solid var(--dash-border)',
          boxShadow:
            'var(--dash-shadow)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <AnimatePresence>
          {isRefreshing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'rgba(255,255,255,0.82)',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent:
                  'center',
                gap: 9,
                color: 'var(--navy)',
                fontWeight: 700,
              }}
            >
              <LoaderCircle
                size={18}
                className="spin"
              />
              Refreshing authoritative
              customer analysis...
            </motion.div>
          )}
        </AnimatePresence>

        <div
          style={{
            overflowX: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse:
                'collapse',
              textAlign: 'left',
              minWidth: 980,
            }}
          >
            <thead>
              <tr
                style={{
                  background:
                    'var(--dash-bg)',
                  borderBottom:
                    '1px solid var(--dash-border)',
                }}
              >
                <th
                  onClick={() =>
                    setSort('name')
                  }
                  style={{
                    padding: '1rem',
                    fontSize: '0.7rem',
                    color:
                      'var(--gray-400)',
                    textTransform:
                      'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  Customer
                </th>

                <th
                  onClick={() =>
                    setSort(
                      'orderCount',
                    )
                  }
                  style={{
                    padding: '1rem',
                    fontSize: '0.7rem',
                    color:
                      'var(--gray-400)',
                    textTransform:
                      'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  Real Orders
                </th>

                <th
                  style={{
                    padding: '1rem',
                    fontSize: '0.7rem',
                    color:
                      'var(--gray-400)',
                    textTransform:
                      'uppercase',
                  }}
                >
                  Status
                </th>

                <th
                  onClick={() =>
                    setSort('score')
                  }
                  style={{
                    padding: '1rem',
                    fontSize: '0.7rem',
                    color:
                      'var(--gray-400)',
                    textTransform:
                      'uppercase',
                    cursor: 'pointer',
                  }}
                >
                  Lead Score
                </th>

                <th
                  style={{
                    padding: '1rem',
                    fontSize: '0.7rem',
                    color:
                      'var(--gray-400)',
                    textTransform:
                      'uppercase',
                  }}
                >
                  Model Probability
                </th>

                <th
                  style={{
                    padding: '1rem',
                    fontSize: '0.7rem',
                    color:
                      'var(--gray-400)',
                    textTransform:
                      'uppercase',
                  }}
                >
                  Reason
                </th>

                <th
                  style={{
                    padding: '1rem',
                    fontSize: '0.7rem',
                    color:
                      'var(--gray-400)',
                    textTransform:
                      'uppercase',
                  }}
                >
                  Model
                </th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                Array.from({
                  length: 5,
                }).map((_, row) => (
                  <tr
                    key={row}
                    style={{
                      borderBottom:
                        '1px solid var(--dash-border)',
                    }}
                  >
                    {Array.from({
                      length: 7,
                    }).map((__, column) => (
                      <td
                        key={column}
                        style={{
                          padding:
                            '1rem',
                        }}
                      >
                        <div
                          style={{
                            height: 20,
                            borderRadius:
                              4,
                            background:
                              'var(--dash-bg)',
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredLeads.length ===
                0 ? (
                <tr>
                  <td
                    colSpan={7}
                    style={{
                      padding:
                        '3.5rem 2rem',
                      textAlign:
                        'center',
                      color:
                        'var(--gray-400)',
                    }}
                  >
                    <Users
                      size={38}
                      strokeWidth={1}
                    />

                    <div
                      style={{
                        marginTop:
                          '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      No customers match
                      this status.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map(
                  (lead, index) => {
                    const meta =
                      statusMeta(
                        lead.status,
                      );

                    return (
                      <motion.tr
                        key={lead.id}
                        initial={{
                          opacity: 0,
                          y: 5,
                        }}
                        animate={{
                          opacity: 1,
                          y: 0,
                        }}
                        transition={{
                          delay:
                            index *
                            0.03,
                        }}
                        style={{
                          borderBottom:
                            '1px solid var(--dash-border)',
                        }}
                      >
                        <td
                          style={{
                            padding:
                              '1rem',
                          }}
                        >
                          <div
                            style={{
                              fontSize:
                                '0.84rem',
                              fontWeight:
                                650,
                              color:
                                'var(--navy)',
                            }}
                          >
                            {lead.name}
                          </div>

                          <div
                            style={{
                              marginTop:
                                2,
                              fontSize:
                                '0.7rem',
                              color:
                                'var(--gray-400)',
                            }}
                          >
                            {lead.email}
                          </div>

                          <div
                            style={{
                              marginTop:
                                2,
                              fontSize:
                                '0.65rem',
                              color:
                                'var(--gray-300)',
                            }}
                          >
                            ID {lead.id}
                          </div>
                        </td>

                        <td
                          style={{
                            padding:
                              '1rem',
                            color:
                              'var(--navy)',
                            fontWeight:
                              700,
                          }}
                        >
                          {lead.orderCount}
                        </td>

                        <td
                          style={{
                            padding:
                              '1rem',
                          }}
                        >
                          <StatusBadge
                            status={
                              lead.status
                            }
                          />
                        </td>

                        <td
                          style={{
                            padding:
                              '1rem',
                          }}
                        >
                          {lead.score !==
                          null ? (
                            <div
                              style={{
                                fontWeight:
                                  800,
                                color:
                                  'var(--navy)',
                              }}
                            >
                              {lead.score.toFixed(
                                2,
                              )}
                            </div>
                          ) : (
                            <span
                              style={{
                                color:
                                  'var(--gray-300)',
                                fontWeight:
                                  700,
                              }}
                            >
                              —
                            </span>
                          )}
                        </td>

                        <td
                          style={{
                            padding:
                              '1rem',
                            fontSize:
                              '0.8rem',
                            color:
                              'var(--navy)',
                          }}
                        >
                          {lead.probability !==
                          null
                            ? `${(
                                lead.probability *
                                100
                              ).toFixed(
                                2,
                              )}%`
                            : '—'}
                        </td>

                        <td
                          style={{
                            padding:
                              '1rem',
                            maxWidth:
                              330,
                          }}
                        >
                          <div
                            style={{
                              color:
                                meta.color,
                              fontSize:
                                '0.76rem',
                              lineHeight:
                                1.45,
                            }}
                          >
                            {reasonText(
                              lead.reason,
                            )}
                          </div>
                        </td>

                        <td
                          style={{
                            padding:
                              '1rem',
                            fontSize:
                              '0.7rem',
                            color:
                              'var(--gray-400)',
                          }}
                        >
                          <div>
                            {lead.modelVersion ||
                              '—'}
                          </div>

                          <div
                            style={{
                              marginTop:
                                3,
                            }}
                          >
                            {lead.featureVersion ||
                              '—'}
                          </div>
                        </td>
                      </motion.tr>
                    );
                  },
                )
              )}
            </tbody>
          </table>
        </div>

        {!isLoading &&
          leads.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent:
                  'space-between',
                gap: '1rem',
                padding:
                  '0.9rem 1.2rem',
                borderTop:
                  '1px solid var(--dash-border)',
                color:
                  'var(--gray-400)',
                fontSize:
                  '0.7rem',
                flexWrap: 'wrap',
              }}
            >
              <span>
                Showing{' '}
                {filteredLeads.length}{' '}
                of {leads.length} real
                customers
              </span>

              <span>
                Mode:{' '}
                {runtimeMeta.refreshMode ||
                  'read-only'}
              </span>
            </div>
          )}
      </div>
    </div>
  );
}