import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  CheckCircle2,
  Info,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';

import api from '../../services/api';


const SCORE_BANDS = [
  {
    min: 80,
    label: 'Very High',
    cls: 'tier-very-high',
  },
  {
    min: 60,
    label: 'High',
    cls: 'tier-high',
  },
  {
    min: 40,
    label: 'Medium',
    cls: 'tier-medium',
  },
  {
    min: 0,
    label: 'Low',
    cls: 'tier-low',
  },
];


function getTier(score, status) {

  if (
    status === 'model_unavailable'
  ) {
    return {
      label: 'Model Unavailable',
      cls: 'tier-none',
    };
  }

  if (
    status !== 'scored' ||
    !Number.isFinite(score)
  ) {
    return {
      label: 'Not Scored',
      cls: 'tier-none',
    };
  }

  return (
    SCORE_BANDS.find(
      (band) =>
        score >= band.min
    ) ||
    SCORE_BANDS[
      SCORE_BANDS.length - 1
    ]
  );
}


function normalizeLead(row) {

  const scoring =
    row?.scoring ||
    {};


  const rawScore =
    Number(
      scoring.lead_score
    );


  const score =
    scoring.lead_score !== null &&
    scoring.lead_score !== undefined &&
    Number.isFinite(rawScore)
      ? rawScore
      : null;


  const activity =
    row?.activity ||
    {};


  return {

    id:
      Number(
        row.customer_id
      ),

    name:
      row.customer_name ||
      `Customer #${row.customer_id}`,

    email:
      row.email ||
      '-',

    totalOrders:
      Number(
        row.order_count ||
        0
      ),

    status:
      scoring.status ||
      'insufficient_data',

    score,

    reason:
      scoring.reason ||
      null,

    activity: {

      purchases:
        Number(
          activity.purchases_30d ||
          0
        ),

      carts:
        Number(
          activity.cart_adds_30d ||
          0
        ),

      views:
        Number(
          activity.views_30d ||
          0
        ),
    },
  };
}


function signalFor(lead) {

  if (
    lead.status === 'model_unavailable'
  ) {
    return 'AI model temporarily unavailable';
  }

  if (
    lead.status !== 'scored' ||
    lead.score === null
  ) {
    return 'More history required';
  }


  if (
    lead.activity.carts >= 10
  ) {
    return 'Strong cart and browsing activity';
  }


  if (
    lead.activity.purchases >= 5
  ) {
    return 'Strong recent purchase activity';
  }


  if (
    lead.activity.purchases >= 2
  ) {
    return 'Consistent recent activity';
  }


  if (
    lead.activity.carts > 0 ||
    lead.activity.views >= 5
  ) {
    return 'Active product interest';
  }


  return 'Limited recent engagement';
}


function SummaryCard({
  label,
  value,
  helper,
  icon,
}) {

  return (
    <div className="lead-stat">

      <div className="lead-stat-head">

        <span>
          {label}
        </span>

        {icon}

      </div>

      <strong>
        {value}
      </strong>

      <small>
        {helper}
      </small>

    </div>
  );
}


export default function LeadScoring() {

  const activeRequest =
    useRef(null);


  const [
    leads,
    setLeads,
  ] =
    useState([]);


  const [
    search,
    setSearch,
  ] =
    useState('');


  const [
    loading,
    setLoading,
  ] =
    useState(true);


  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false);


  const [
    error,
    setError,
  ] =
    useState('');


  const [
    lastRefresh,
    setLastRefresh,
  ] =
    useState(null);


  const load =
    useCallback(
      async (
        refresh = false
      ) => {

        activeRequest.current
          ?.abort();


        const controller =
          new AbortController();


        activeRequest.current =
          controller;


        setError('');


        if (refresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }


        try {

          const options = {

            params: {
              limit: 100,
            },

            signal:
              controller.signal,

            timeout:
              60000,
          };


          const response =
            refresh

              ? await api.post(
                  '/leads/recalculate',
                  null,
                  options
                )

              : await api.get(
                  '/leads',
                  options
                );


          if (
            controller.signal
              .aborted
          ) {
            return;
          }


          const rows =
            response
              ?.data
              ?.data
              ?.leads;


          setLeads(
            Array.isArray(rows)

              ? rows.map(
                  normalizeLead
                )

              : []
          );

          setLastRefresh(
            new Date()
          );

        } catch (err) {

          if (
            controller.signal
              .aborted
          ) {
            return;
          }


          console.error(
            'Lead scoring load failed:',
            err
          );


          setLeads([]);

          setLastRefresh(null);


          setError(
            err?.response?.data?.message ||
            'Lead scoring data is currently unavailable.'
          );

        } finally {

          if (
            activeRequest.current ===
              controller &&
            !controller.signal
              .aborted
          ) {

            activeRequest.current =
              null;

            setLoading(false);

            setRefreshing(false);
          }
        }
      },
      []
    );


  useEffect(
    () => {

      load(false);

      return () =>
        activeRequest.current
          ?.abort();

    },
    [
      load
    ]
  );


  const enriched =
    useMemo(
      () =>
        leads.map(
          (lead) => ({

            ...lead,

            tier:
              getTier(
                lead.score,
                lead.status
              ),

            signal:
              signalFor(
                lead
              ),
          })
        ),
      [
        leads
      ]
    );


  const stats =
    useMemo(
      () => {

        const scored =
          enriched.filter(
            (lead) =>
              lead.status === 'scored' &&
              lead.score !== null
          );


        return {

          total:
            enriched.length,

          scored:
            scored.length,

          high:
            scored.filter(
              (lead) =>
                lead.score >= 60
            ).length,

          history:
            enriched.filter(
              (lead) =>
                lead.status !== 'scored' ||
                lead.score === null
            ).length,
        };
      },
      [
        enriched
      ]
    );


  const visible =
    useMemo(
      () => {

        const term =
          search
            .trim()
            .toLowerCase();


        const filtered =
          !term
            ? enriched
            : enriched.filter(
                (lead) =>
                  lead.name
                    .toLowerCase()
                    .includes(term) ||

                  lead.email
                    .toLowerCase()
                    .includes(term) ||

                  String(
                    lead.id
                  ).includes(term)
              );


        return [
          ...filtered
        ].sort(
          (a, b) => {

            const aScore =
              a.score ??
              -1;

            const bScore =
              b.score ??
              -1;


            if (
              bScore !==
              aScore
            ) {
              return (
                bScore -
                aScore
              );
            }


            return (
              a.name.localeCompare(
                b.name
              )
            );
          }
        );
      },
      [
        enriched,
        search
      ]
    );


  return (

    <div className="lead-page">

      <div className="lead-header">

        <div>

          <h1>
            AI Lead Scoring
          </h1>

          <p>
            AI-powered customer prioritization using purchase and engagement behaviour.
          </p>

          {lastRefresh && (

            <small>
              Last refreshed:{' '}
              {lastRefresh.toLocaleString()}
            </small>
          )}

        </div>


        <button
          className="refresh-btn"
          disabled={
            loading ||
            refreshing
          }
          onClick={() =>
            load(true)
          }
        >

          <RefreshCw
            size={15}
            className={
              refreshing
                ? 'spin'
                : ''
            }
          />

          Refresh Analysis

        </button>

      </div>


      <div className="stats-grid">

        <SummaryCard
          label="Customers Analyzed"
          value={stats.total}
          helper="Registered active customers"
          icon={
            <Users size={16} />
          }
        />

        <SummaryCard
          label="Scored Leads"
          value={stats.scored}
          helper="AI score available"
          icon={
            <CheckCircle2
              size={16}
            />
          }
        />

        <SummaryCard
          label="High Priority"
          value={stats.high}
          helper="High + Very High tiers"
          icon={
            <ShieldCheck
              size={16}
            />
          }
        />

        <SummaryCard
          label="Need More History"
          value={stats.history}
          helper="Score safely withheld"
          icon={
            <Info size={16} />
          }
        />

      </div>


      <div className="governance">

        <strong>
          60-Day Analysis
        </strong>

        <span>|</span>

        <span>
          Next 30-Day Purchase Target
        </span>

        <span>|</span>

        <span>
          28 Behavioral Features
        </span>

        <span>|</span>

        <span>
          On-Demand AI Scoring
        </span>

      </div>


      <div className="unified-banner">

        <ShieldCheck
          size={14}
        />

        <span>
          <strong>
            Unified Lead View
          </strong>
          {' - '}
          AI score, operational order history and recent customer activity are shown together.
        </span>

      </div>


      {error && (

        <div className="error-box">
          {error}
        </div>
      )}


      <div className="table-card">

        <div className="table-top">

          <div>

            <h2>
              Customer Lead Overview
            </h2>

            <p>
              Highest lead scores appear first.
            </p>

          </div>


          <div className="search-box">

            <Search
              size={14}
            />

            <input
              value={search}
              onChange={
                (event) =>
                  setSearch(
                    event.target.value
                  )
              }
              placeholder="Search customers..."
            />

          </div>

        </div>


        <div className="table-scroll">

          <table>

            <thead>

              <tr>

                <th>Customer</th>
                <th>Total Orders</th>
                <th>Lead Score</th>
                <th>Recent Activity</th>
                <th>Lead Tier</th>
                <th>Key Signal</th>

              </tr>

            </thead>


            <tbody>

              {loading ? (

                <tr>

                  <td
                    colSpan={6}
                    className="empty"
                  >
                    Loading customer analysis...
                  </td>

                </tr>

              ) : visible.length === 0 ? (

                <tr>

                  <td
                    colSpan={6}
                    className="empty"
                  >
                    No registered customers found.
                  </td>

                </tr>

              ) : (

                visible.map(
                  (lead) => (

                    <tr key={lead.id}>

                      <td>

                        <div className="name">
                          {lead.name}
                        </div>

                        <div className="email">
                          {lead.email}
                        </div>

                        <div className="customer-id">
                          Customer #{lead.id}
                        </div>

                      </td>


                      <td className="orders">
                        {lead.totalOrders}
                      </td>


                      <td>

                        {lead.score !== null ? (

                          <>
                            <div className="score">
                              {lead.score.toFixed(2)}
                            </div>

                            <div className="score-note">
                              lead propensity score
                            </div>
                          </>

                        ) : (

                          <>
                            <div className="no-score">
                              -
                            </div>

                            <div className="need-history">
                              More history needed
                            </div>
                          </>
                        )}

                      </td>


                      <td>

                        <div className="activity">

                          <span>
                            <strong>
                              {lead.activity.purchases}
                            </strong>
                            {' '}
                            purchases
                          </span>

                          <b>|</b>

                          <span>
                            <strong>
                              {lead.activity.carts}
                            </strong>
                            {' '}
                            carts
                          </span>

                          <b>|</b>

                          <span>
                            <strong>
                              {lead.activity.views}
                            </strong>
                            {' '}
                            views
                          </span>

                        </div>

                      </td>


                      <td>

                        <span
                          className={
                            `tier ${lead.tier.cls}`
                          }
                        >
                          {lead.tier.label}
                        </span>

                      </td>


                      <td className="signal">
                        {lead.signal}
                      </td>

                    </tr>
                  )
                )
              )}

            </tbody>

          </table>

        </div>


        <div className="footer">

          <span>
            Showing{' '}
            {visible.length}{' '}
            of{' '}
            {leads.length}{' '}
            registered customers
          </span>

          <span>
            Lead tiers are operational score bands.
          </span>

        </div>

      </div>


      <style>{`

        .lead-page {
          max-width: 1480px;
          margin: 0 auto;
          padding: 1.25rem 1.4rem 2rem;
          color: #10243e;
        }

        .lead-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          flex-wrap: wrap;
          margin-bottom: 1rem;
        }

        .lead-header h1 {
          margin: 0;
          font-size: 1.45rem;
          font-weight: 800;
        }

        .lead-header p {
          margin: .3rem 0 0;
          color: #64748b;
          font-size: .77rem;
        }

        .lead-header small {
          display: block;
          margin-top: .2rem;
          color: #94a3b8;
          font-size: .64rem;
        }

        .refresh-btn {
          border: 1px solid #e2e8f0;
          background: white;
          color: #10243e;
          border-radius: 10px;
          padding: .58rem .82rem;
          font-size: .71rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: .4rem;
          cursor: pointer;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: .75rem;
          margin-bottom: .8rem;
        }

        .lead-stat {
          background: white;
          border: 1px solid #e5eaf0;
          border-radius: 14px;
          padding: .9rem 1rem;
          box-shadow: 0 4px 14px rgba(15,23,42,.035);
        }

        .lead-stat-head {
          display: flex;
          justify-content: space-between;
          color: #64748b;
          font-size: .65rem;
          font-weight: 750;
          text-transform: uppercase;
          letter-spacing: .04em;
        }

        .lead-stat > strong {
          display: block;
          margin-top: .55rem;
          font-size: 1.5rem;
        }

        .lead-stat small {
          display: block;
          margin-top: .4rem;
          color: #94a3b8;
          font-size: .63rem;
        }

        .governance {
          display: flex;
          gap: .5rem;
          flex-wrap: wrap;
          align-items: center;
          border: 1px solid #e5eaf0;
          background: white;
          border-radius: 11px;
          padding: .62rem .8rem;
          color: #64748b;
          font-size: .68rem;
          margin-bottom: .7rem;
        }

        .governance strong {
          color: #10243e;
        }

        .unified-banner {
          display: flex;
          align-items: center;
          gap: .45rem;
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
          color: #166534;
          border-radius: 10px;
          padding: .62rem .8rem;
          margin-bottom: .8rem;
          font-size: .69rem;
        }

        .error-box {
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #b91c1c;
          padding: .7rem .8rem;
          border-radius: 10px;
          margin-bottom: .8rem;
          font-size: .72rem;
        }

        .table-card {
          background: white;
          border: 1px solid #e5eaf0;
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 5px 18px rgba(15,23,42,.035);
        }

        .table-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: .8rem;
          padding: .8rem 1rem;
          border-bottom: 1px solid #eef2f7;
        }

        .table-top h2 {
          margin: 0;
          font-size: .86rem;
          font-weight: 800;
        }

        .table-top p {
          margin: .18rem 0 0;
          color: #94a3b8;
          font-size: .64rem;
        }

        .search-box {
          width: 250px;
          max-width: 100%;
          display: flex;
          gap: .4rem;
          align-items: center;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          padding: 0 .65rem;
          color: #94a3b8;
        }

        .search-box input {
          width: 100%;
          border: 0;
          outline: 0;
          padding: .52rem 0;
          font-size: .7rem;
          background: transparent;
        }

        .table-scroll {
          overflow-x: auto;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 980px;
        }

        thead {
          background: #f8fafc;
        }

        th {
          padding: .72rem 1rem;
          text-align: left;
          color: #64748b;
          font-size: .62rem;
          text-transform: uppercase;
          letter-spacing: .04em;
          border-bottom: 1px solid #e9eef5;
        }

        td {
          padding: .84rem 1rem;
          border-bottom: 1px solid #f1f5f9;
          font-size: .71rem;
          vertical-align: middle;
        }

        .name {
          font-size: .76rem;
          font-weight: 800;
        }

        .email {
          margin-top: .15rem;
          color: #64748b;
          font-size: .63rem;
        }

        .customer-id {
          margin-top: .1rem;
          color: #94a3b8;
          font-size: .58rem;
        }

        .orders {
          font-size: .77rem;
          font-weight: 800;
        }

        .score {
          font-size: .91rem;
          font-weight: 850;
        }

        .score-note {
          margin-top: .15rem;
          color: #94a3b8;
          font-size: .58rem;
        }

        .no-score {
          color: #94a3b8;
          font-weight: 800;
        }

        .need-history {
          margin-top: .12rem;
          color: #b45309;
          font-size: .58rem;
        }

        .activity {
          display: flex;
          gap: .34rem;
          align-items: center;
          white-space: nowrap;
          color: #64748b;
          font-size: .67rem;
        }

        .activity strong {
          color: #10243e;
        }

        .activity b {
          color: #cbd5e1;
        }

        .tier {
          display: inline-flex;
          padding: .3rem .56rem;
          border-radius: 999px;
          font-size: .62rem;
          font-weight: 800;
        }

        .tier-very-high {
          background: #ecfdf5;
          color: #047857;
        }

        .tier-high {
          background: #f0f9ff;
          color: #0369a1;
        }

        .tier-medium {
          background: #fffbeb;
          color: #b45309;
        }

        .tier-low,
        .tier-none {
          background: #f1f5f9;
          color: #64748b;
        }

        .signal {
          color: #475569;
          min-width: 190px;
        }

        .empty {
          text-align: center;
          padding: 2rem !important;
          color: #94a3b8;
        }

        .footer {
          display: flex;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: .5rem;
          padding: .62rem 1rem;
          color: #94a3b8;
          font-size: .62rem;
        }

        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 900px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

      `}</style>

    </div>
  );
}

