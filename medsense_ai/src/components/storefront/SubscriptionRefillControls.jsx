import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubscriptions, linkSubscriptionRefill, unlinkSubscriptionRefill } from '../../services/storefrontSubscriptionService';

export default function SubscriptionRefillControls({ reminders, onChange }) {
  const [subscription, setSubscription] = useState(null);
  const [days, setDays] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    getSubscriptions().then(data => {
      if (mounted) setSubscription(data.subscriptions.find(row => row.subscription_status === 'active' && row.last_payment_at && !row.payment_failure_at) || null);
    }).catch(() => { if (mounted) setSubscription(null); });
    return () => { mounted = false; };
  }, []);
  async function change(row, unlink) {
    setBusy(row.reminder_id); setError('');
    try {
      if (unlink) await unlinkSubscriptionRefill(row.reminder_id);
      else await linkSubscriptionRefill(subscription.subscription_id, row.reminder_id, Number(days[row.reminder_id] || row.recurrence_days || 30));
      await onChange();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(null); }
  }
  const active = reminders.filter(row => row.lifecycle_status === 'active');
  return <section className="sf-summary-block" style={{ marginBottom: '1rem' }}>
    <h2>Recurring refill reminders</h2>
    <p className="sf-muted">With an active paid subscription, choose a repeat interval. Marking a reminder done schedules the next one. Cancelling the subscription stops repeats.</p>
    <Link className="sf-link" to="/subscriptions">Manage subscription</Link>
    {error && <p role="alert" className="sf-badge-danger">{error}</p>}
    {!subscription && <p className="sf-muted">Activate a subscription and confirm its payment to enable recurring reminders. You can still use manual reminders.</p>}
    {active.filter(row => subscription || row.subscription_id).map(row => <div key={row.reminder_id} style={{ marginTop: '1rem' }}>
      <strong>{row.product_title}</strong>
      {row.subscription_id && <p>Linked reminder · repeats every {row.recurrence_days} days while subscription is active.</p>}
      {subscription && <label style={{ display: 'block', margin: '0.5rem 0' }}>Repeat interval in days for {row.product_title}
        <input type="number" min="1" max="365" style={{ marginLeft: '0.5rem', width: '5rem' }} value={days[row.reminder_id] ?? row.recurrence_days ?? 30}
          onChange={event => setDays(current => ({ ...current, [row.reminder_id]: event.target.value }))} />
      </label>}
      {subscription && <button className="sf-button" disabled={Boolean(busy)} onClick={() => void change(row, false)}>{row.subscription_id ? 'Update repeat interval' : 'Enable recurring reminder'}</button>}
      {row.subscription_id && <button className="sf-link" disabled={Boolean(busy)} onClick={() => void change(row, true)}>Stop repeating</button>}
    </div>)}
  </section>;
}
