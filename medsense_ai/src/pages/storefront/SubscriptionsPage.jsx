import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getSubscriptionConfig, getSubscriptions, createSubscription, refreshSubscription,
  cancelSubscription, safePayPalApprovalURL } from '../../services/storefrontSubscriptionService';

const label = status => String(status || '').replaceAll('_', ' ');
const date = value => value ? new Date(value).toLocaleDateString() : 'Not set';

export default function SubscriptionsPage() {
  const [params, setParams] = useSearchParams();
  const [config, setConfig] = useState(null);
  const [records, setRecords] = useState({ subscriptions: [], payments: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cancelId, setCancelId] = useState(null);
  const returned = useRef(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, data] = await Promise.all([getSubscriptionConfig(), getSubscriptions()]);
      setConfig(settings); setRecords(data);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (returned.current || !params.has('approval')) return;
    returned.current = true;
    const id = Number(params.get('subscription'));
    if (params.get('approval') === 'returned' && Number.isSafeInteger(id) && id > 0) {
      setBusy('return');
      refreshSubscription(id).then(result => {
        setMessage(result.subscription_status === 'active' ? 'Subscription verified with PayPal.' : 'Approval received. Payment or activation may still be pending. Refresh status shortly.');
        return load();
      }).catch(failure => setError(failure.message)).finally(() => { setBusy(''); setParams({}, { replace: true }); });
    } else {
      setMessage('PayPal approval was not completed. You can resume your pending subscription below.');
      setParams({}, { replace: true });
    }
  }, [params, setParams, load]);
  async function act(key, action, success) {
    setBusy(key); setError(''); setMessage('');
    try { await action(); if (success) setMessage(success); await load(); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  async function subscribe(plan) {
    setBusy(plan.interval); setError('');
    try {
      const result = await createSubscription(plan.interval);
      window.location.assign(safePayPalApprovalURL(result.approval_url, plan.environment));
    } catch (failure) { setError(failure.message); setBusy(''); }
  }
  const current = records.subscriptions.find(row => ['approval_pending','approved','active','suspended'].includes(row.subscription_status));
  return <div className="storefront-shell"><section className="sf-card sf-section-card">
    <Link className="sf-link" to="/account">← Back to Account</Link>
    <div className="sf-page-header"><div><h1>Subscriptions</h1>
      <p className="sf-section-subcopy">Manage your refill reminder subscription and payment history.</p></div>
      <Link className="sf-button" to="/refills">Refill reminders</Link></div>
    {error && <p role="alert" className="sf-badge-danger">{error}</p>}
    {message && <p role="status" className="sf-badge-success">{message}</p>}
    <p className="sf-muted">The subscription fee pays for recurring reminder service. Medicines are purchased separately through the usual checkout. You choose refill dates and repeat intervals.</p>
    {loading ? <p className="sf-loading">Loading subscriptions...</p> : <>
      {!config?.enabled && <div className="sf-summary-block" role="status">
        <strong>Subscriptions are temporarily unavailable</strong>
        <p>{config?.unavailable?.find(item => item.code !== 'PAYPAL_PLAN_MISSING')?.message || config?.unavailable?.[0]?.message || 'Please try again later.'}</p>
      </div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {config?.plans?.map(plan => <article className="sf-summary-block" key={plan.interval}>
          <h2 style={{ textTransform: 'capitalize' }}>{plan.interval} plan</h2>
          <p><strong>{plan.currency} {plan.amount}</strong> / {plan.frequency.interval_unit.toLowerCase()}</p>
          {plan.environment === 'sandbox' && <p className="sf-badge">Sandbox — test payments</p>}
          {plan.cycles.filter(cycle => cycle.type === 'TRIAL').map((cycle, index) => <p key={index}>
            Trial: {cycle.cycles} cycle(s), every {cycle.frequency.interval_count} {cycle.frequency.interval_unit.toLowerCase()}; {cycle.price ? `${cycle.price.currency_code} ${cycle.price.value}` : 'free'}.
          </p>)}
          {!!plan.cycles.find(cycle => cycle.type === 'REGULAR')?.cycles && <p>{plan.cycles.find(cycle => cycle.type === 'REGULAR').cycles} regular billing cycles.</p>}
          {Number(plan.setup_fee?.value) > 0 && <p>Setup fee: {plan.setup_fee.currency_code} {plan.setup_fee.value}</p>}
          {Number(plan.taxes?.percentage) > 0 && <p>Tax: {plan.taxes.percentage}% ({plan.taxes.inclusive ? 'included' : 'additional'})</p>}
          <button className="sf-button" disabled={Boolean(busy) || Boolean(current)} onClick={() => void subscribe(plan)}>
            {busy === plan.interval ? 'Opening PayPal...' : 'Subscribe with PayPal'}
          </button>
        </article>)}
      </div>
      <h2>My subscription</h2>
      {!records.subscriptions.length && <p className="sf-muted">You have no subscriptions yet.</p>}
      {records.subscriptions.map(row => <article className="sf-summary-block" style={{ marginBottom: '1rem' }} key={row.subscription_id}>
        <p><strong>{row.currency} {row.amount}</strong> · <span style={{ textTransform: 'capitalize' }}>{label(row.subscription_status)}</span></p>
        <p className="sf-muted">Next billing: {date(row.next_billing_at)} · Last payment: {date(row.last_payment_at)}</p>
        {row.subscription_status === 'active' && !row.last_payment_at && <p>Waiting for payment confirmation. Recurring reminders unlock after a verified payment.</p>}
        {row.payment_failure_at && <p role="status">A subscription payment failed. Recurring reminders are paused until payment is confirmed.</p>}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          {row.subscription_status === 'approval_pending' && row.approval_url && <button className="sf-button" disabled={Boolean(busy)} onClick={() => {
            try { window.location.assign(safePayPalApprovalURL(row.approval_url, row.environment)); } catch (failure) { setError(failure.message); }
          }}>Continue PayPal approval</button>}
          {row.paypal_subscription_id && <button className="sf-button" disabled={Boolean(busy)} onClick={() => void act(`refresh-${row.subscription_id}`, () => refreshSubscription(row.subscription_id), 'Subscription status and payments refreshed.')}>Refresh status</button>}
          {!['cancelled','expired'].includes(row.subscription_status) && <button className="sf-link" disabled={Boolean(busy)} onClick={() => setCancelId(row.subscription_id)}>Cancel subscription</button>}
        </div>
        {cancelId === row.subscription_id && <div role="group" aria-label="Confirm cancellation">
          <p>Cancel future subscription billing and stop recurring reminders? Existing reminder history stays available.</p>
          <button className="sf-button" disabled={Boolean(busy)} onClick={() => void act(`cancel-${row.subscription_id}`, async () => { await cancelSubscription(row.subscription_id); setCancelId(null); }, 'Subscription cancelled. Future recurring reminders are stopped.')}>Confirm cancellation</button>
          <button className="sf-link" onClick={() => setCancelId(null)}>Keep subscription</button>
        </div>}
      </article>)}
      <h2>Payment history</h2>
      {!records.payments.length ? <p className="sf-muted">No verified payments yet.</p> : <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', textAlign: 'left' }}><thead><tr><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>{records.payments.map(payment => <tr key={payment.payment_id}><td>{date(payment.paid_at)}</td><td>{payment.currency} {payment.amount}</td><td>{label(payment.payment_status)}</td></tr>)}</tbody></table>
      </div>}
    </>}
  </section></div>;
}
