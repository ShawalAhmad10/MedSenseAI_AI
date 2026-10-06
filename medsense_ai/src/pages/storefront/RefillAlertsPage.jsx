import React, {
  useCallback,
  useMemo,
  useState,
} from 'react';
import {
  Link,
} from 'react-router-dom';

import {
  useAuth,
} from '../../context/AuthContext';

import {
  cancelRefillReminder,
  completeRefillReminder,
  createRefillReminder,
  getRefillReminders,
  getRefillSources,
  rescheduleRefillReminder,
} from '../../services/storefrontRefillService';

function isoToday() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}

function formatDate(value) {
  if (!value) {
    return 'Not set';
  }

  const parsed =
    new Date(
      `${value}T00:00:00`
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return value;
  }

  return parsed.toLocaleDateString(
    'en-US',
    {
      year:
        'numeric',

      month:
        'short',

      day:
        'numeric',
    }
  );
}

function productSlug(value) {
  return String(
    value || 'medicine'
  )
    .toLowerCase()
    .trim()
    .replace(
      /\s+/g,
      '-'
    )
    .replace(
      /[^a-z0-9-]/g,
      ''
    );
}

function sourceKey(source) {
  return (
    `${source.invoice_id}:` +
    `${source.product_id}`
  );
}

function reminderSourceKey(reminder) {
  return (
    `${reminder.source_invoice_id}:` +
    `${reminder.product_id}`
  );
}

function stateLabel(state) {
  const value =
    String(
      state || ''
    ).toUpperCase();

  if (value === 'DUE_TODAY') {
    return 'Due today';
  }

  if (value === 'OVERDUE') {
    return 'Overdue';
  }

  if (value === 'COMPLETED') {
    return 'Completed';
  }

  if (value === 'CANCELLED') {
    return 'Cancelled';
  }

  return 'Scheduled';
}

function stateClass(state) {
  const value =
    String(
      state || ''
    ).toUpperCase();

  if (value === 'OVERDUE') {
    return 'sf-badge-danger';
  }

  if (value === 'DUE_TODAY') {
    return 'sf-badge-warning';
  }

  if (value === 'COMPLETED') {
    return 'sf-badge-success';
  }

  return 'sf-badge';
}

export default function RefillAlertsPage() {
  const {
    isAuthenticated,
    openAuthModal,
  } = useAuth();

  const [
    sources,
    setSources,
  ] = useState([]);

  const [
    reminders,
    setReminders,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    message,
    setMessage,
  ] = useState('');

  const [
    selectedSource,
    setSelectedSource,
  ] = useState('');

  const [
    reminderDate,
    setReminderDate,
  ] = useState('');

  const [
    rescheduleDates,
    setRescheduleDates,
  ] = useState({});

  const [
    busyAction,
    setBusyAction,
  ] = useState('');

  const load =
    useCallback(
      async () => {
        if (!isAuthenticated) {
          setSources([]);
          setReminders([]);
          return;
        }

        setLoading(true);
        setError('');

        try {
          const [
            sourceRows,
            reminderRows,
          ] =
            await Promise.all([
              getRefillSources(),
              getRefillReminders(),
            ]);

          setSources(
            Array.isArray(sourceRows)
              ? sourceRows
              : []
          );

          setReminders(
            Array.isArray(reminderRows)
              ? reminderRows
              : []
          );
        } catch (requestError) {
          setError(
            requestError.message ||
            'Could not load refill reminders.'
          );
        } finally {
          setLoading(false);
        }
      },
      [
        isAuthenticated,
      ]
    );

  React.useEffect(
    () => {
      void load();
    },
    [
      load,
    ]
  );

  const activeReminders =
    useMemo(
      () =>
        reminders.filter(
          (item) =>
            item.lifecycle_status ===
            'active'
        ),
      [
        reminders,
      ]
    );

  const history =
    useMemo(
      () =>
        reminders.filter(
          (item) =>
            item.lifecycle_status !==
            'active'
        ),
      [
        reminders,
      ]
    );

  const activeSourceKeys =
    useMemo(
      () =>
        new Set(
          activeReminders.map(
            reminderSourceKey
          )
        ),
      [
        activeReminders,
      ]
    );

  const availableSources =
    useMemo(
      () =>
        sources.filter(
          (source) =>
            !activeSourceKeys.has(
              sourceKey(source)
            )
        ),
      [
        sources,
        activeSourceKeys,
      ]
    );

  async function createReminder(
    event
  ) {
    event.preventDefault();

    setError('');
    setMessage('');

    if (
      !selectedSource ||
      !reminderDate
    ) {
      setError(
        'Choose a delivered medicine and reminder date.'
      );

      return;
    }

    const [
      invoiceId,
      productId,
    ] =
      selectedSource
        .split(':')
        .map(Number);

    setBusyAction(
      'create'
    );

    try {
      await createRefillReminder({
        source_invoice_id:
          invoiceId,

        product_id:
          productId,

        reminder_date:
          reminderDate,
      });

      setSelectedSource('');
      setReminderDate('');

      setMessage(
        'Refill reminder scheduled.'
      );

      await load();
    } catch (requestError) {
      setError(
        requestError.message ||
        'Could not create refill reminder.'
      );
    } finally {
      setBusyAction('');
    }
  }

  async function reschedule(
    reminder
  ) {
    const nextDate =
      rescheduleDates[
        reminder.reminder_id
      ] ||
      reminder.reminder_date;

    setBusyAction(
      `reschedule-${reminder.reminder_id}`
    );

    setError('');
    setMessage('');

    try {
      await rescheduleRefillReminder(
        reminder.reminder_id,
        nextDate
      );

      setMessage(
        'Reminder date updated.'
      );

      await load();
    } catch (requestError) {
      setError(
        requestError.message ||
        'Could not reschedule reminder.'
      );
    } finally {
      setBusyAction('');
    }
  }

  async function complete(
    reminder
  ) {
    setBusyAction(
      `complete-${reminder.reminder_id}`
    );

    setError('');
    setMessage('');

    try {
      await completeRefillReminder(
        reminder.reminder_id
      );

      setMessage(
        'Reminder marked complete.'
      );

      await load();
    } catch (requestError) {
      setError(
        requestError.message ||
        'Could not complete reminder.'
      );
    } finally {
      setBusyAction('');
    }
  }

  async function cancel(
    reminder
  ) {
    setBusyAction(
      `cancel-${reminder.reminder_id}`
    );

    setError('');
    setMessage('');

    try {
      await cancelRefillReminder(
        reminder.reminder_id
      );

      setMessage(
        'Reminder cancelled.'
      );

      await load();
    } catch (requestError) {
      setError(
        requestError.message ||
        'Could not cancel reminder.'
      );
    } finally {
      setBusyAction('');
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="storefront-shell">
        <div className="sf-card sf-section-card">
          <h1>
            Refill Reminders
          </h1>

          <p className="sf-muted">
            Sign in to create reminders from medicines you previously purchased.
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
            Sign in for refill reminders
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
              Refill Reminders
            </h1>

            <p
              className="sf-section-subcopy"
              style={{
                marginBottom:
                  0,
              }}
            >
              Schedule your own reminder date for a medicine from a real delivered purchase.
            </p>
          </div>
        </div>

        <div
          className="sf-summary-block"
          style={{
            marginBottom:
              '1rem',
          }}
        >
          <strong>
            How refill timing works
          </strong>

          <p
            className="sf-muted"
            style={{
              marginBottom:
                0,
            }}
          >
            You choose the reminder date. MedSenseAI does not infer dose frequency, days supply, medicine consumption, or clinical refill timing from purchase quantity.
          </p>
        </div>

        {error && (
          <div
            className="sf-badge-danger"
            style={{
              display:
                'block',

              marginBottom:
                '1rem',

              padding:
                '0.75rem',
            }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            className="sf-badge-success"
            style={{
              display:
                'block',

              marginBottom:
                '1rem',

              padding:
                '0.75rem',
            }}
          >
            {message}
          </div>
        )}

<div
          className="sf-summary-block"
          style={{
            marginBottom:
              '1.2rem',
          }}
        >
          <strong
            style={{
              display:
                'block',

              marginBottom:
                '0.75rem',
            }}
          >
            Schedule a reminder
          </strong>

          {loading ? (
            <div className="sf-loading">
              Loading delivered medicines...
            </div>
          ) : availableSources.length === 0 ? (
            <div className="sf-empty">
              No delivered purchase is currently available for a new reminder.
            </div>
          ) : (
            <form
              onSubmit={
                createReminder
              }
              style={{
                display:
                  'grid',

                gap:
                  '0.75rem',
              }}
            >
              <label>
                <span
                  className="sf-muted"
                  style={{
                    display:
                      'block',

                    marginBottom:
                      '0.35rem',
                  }}
                >
                  Delivered medicine
                </span>

                <select
                  onChange={(event) =>
                    setSelectedSource(
                      event.target.value
                    )
                  }
                  required
                  style={{
                    width:
                      '100%',

                    padding:
                      '0.75rem',

                    border:
                      '1px solid var(--sf-border)',

                    borderRadius:
                      12,

                    background:
                      'white',
                  }}
                  value={
                    selectedSource
                  }
                >
                  <option value="">
                    Select a purchased medicine
                  </option>

                  {availableSources.map(
                    (source) => (
                      <option
                        key={
                          sourceKey(
                            source
                          )
                        }
                        value={
                          sourceKey(
                            source
                          )
                        }
                      >
                        {source.product_title}
                        {' - '}
                        {source.invoice_number}
                        {' - qty '}
                        {source.purchased_quantity}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label>
                <span
                  className="sf-muted"
                  style={{
                    display:
                      'block',

                    marginBottom:
                      '0.35rem',
                  }}
                >
                  Reminder date
                </span>

                <input
                  min={isoToday()}
                  onChange={(event) =>
                    setReminderDate(
                      event.target.value
                    )
                  }
                  required
                  style={{
                    width:
                      '100%',

                    padding:
                      '0.75rem',

                    border:
                      '1px solid var(--sf-border)',

                    borderRadius:
                      12,
                  }}
                  type="date"
                  value={
                    reminderDate
                  }
                />
              </label>

              <button
                className="sf-button"
                disabled={
                  busyAction ===
                  'create'
                }
                type="submit"
              >
                {busyAction ===
                'create'
                  ? 'Saving...'
                  : 'Schedule reminder'}
              </button>
            </form>
          )}
        </div>

        <div
          className="sf-page-header"
          style={{
            marginTop:
              '1.25rem',
          }}
        >
          <div>
            <h2 className="sf-section-heading">
              Active reminders
            </h2>

            <p
              className="sf-section-subcopy"
              style={{
                marginBottom:
                  0,
              }}
            >
              Due state is based only on your selected reminder date.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="sf-loading">
            Loading refill reminders...
          </div>
        ) : activeReminders.length === 0 ? (
          <div className="sf-empty">
            No active refill reminder is scheduled.
          </div>
        ) : (
          <div
            style={{
              display:
                'grid',

              gap:
                '1rem',
            }}
          >
            {activeReminders.map(
              (reminder) => (
                <article
                  className="sf-summary-block"
                  key={
                    reminder.reminder_id
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
                        {reminder.product_title}
                      </strong>

                      <span className="sf-muted">
                        {reminder.invoice_number}
                        {' · '}
                        purchased quantity{' '}
                        {reminder.purchased_quantity}
                      </span>
                    </div>

                    <span
                      className={
                        stateClass(
                          reminder.reminder_state
                        )
                      }
                    >
                      {stateLabel(
                        reminder.reminder_state
                      )}
                    </span>
                  </div>

                  <p
                    style={{
                      marginBottom:
                        '0.45rem',
                    }}
                  >
                    Reminder date:{' '}
                    <strong>
                      {formatDate(
                        reminder.reminder_date
                      )}
                    </strong>
                  </p>

                  <p
                    className="sf-muted"
                    style={{
                      marginTop:
                        0,
                    }}
                  >
                    {reminder.reminder_state ===
                    'SCHEDULED'
                      ? `${reminder.days_until_due} day(s) until your selected reminder date.`
                      : reminder.reminder_state ===
                          'DUE_TODAY'
                        ? 'Your selected reminder date is today.'
                        : 'Your selected reminder date has passed.'}
                  </p>

                  <div
                    style={{
                      display:
                        'flex',

                      gap:
                        '0.65rem',

                      flexWrap:
                        'wrap',

                      alignItems:
                        'end',
                    }}
                  >
                    <label>
                      <span
                        className="sf-muted"
                        style={{
                          display:
                            'block',

                          fontSize:
                            '0.78rem',

                          marginBottom:
                            '0.25rem',
                        }}
                      >
                        Reschedule
                      </span>

                      <input
                        min={
                          isoToday()
                        }
                        onChange={(
                          event
                        ) =>
                          setRescheduleDates(
                            (
                              current
                            ) => ({
                              ...current,

                              [reminder.reminder_id]:
                                event.target.value,
                            })
                          )
                        }
                        style={{
                          padding:
                            '0.55rem',

                          border:
                            '1px solid var(--sf-border)',

                          borderRadius:
                            10,
                        }}
                        type="date"
                        value={
                          rescheduleDates[
                            reminder
                              .reminder_id
                          ] ||
                          reminder
                            .reminder_date
                        }
                      />
                    </label>

                    <button
                      className="sf-button"
                      disabled={
                        busyAction ===
                        `reschedule-${reminder.reminder_id}`
                      }
                      onClick={() =>
                        void reschedule(
                          reminder
                        )
                      }
                      type="button"
                    >
                      Save date
                    </button>

                    <button
                      className="sf-button"
                      disabled={
                        busyAction ===
                        `complete-${reminder.reminder_id}`
                      }
                      onClick={() =>
                        void complete(
                          reminder
                        )
                      }
                      type="button"
                    >
                      Mark done
                    </button>

                    <button
                      className="sf-link"
                      disabled={
                        busyAction ===
                        `cancel-${reminder.reminder_id}`
                      }
                      onClick={() =>
                        void cancel(
                          reminder
                        )
                      }
                      type="button"
                    >
                      Cancel reminder
                    </button>

                    {reminder.reorder_available ? (
                      <Link
                        className="sf-link"
                        to={`/product/${productSlug(
                          reminder.product_title
                        )}`}
                      >
                        Reorder medicine
                      </Link>
                    ) : (
                      <span className="sf-muted">
                        Reorder currently unavailable
                      </span>
                    )}
                  </div>

                  <p
                    className="sf-muted"
                    style={{
                      fontSize:
                        '0.78rem',

                      marginBottom:
                        0,

                      marginTop:
                        '0.75rem',
                    }}
                  >
                    Reorder opens the real product page. Any later cart or checkout change remains subject to the normal authoritative interaction check.
                  </p>
                </article>
              )
            )}
          </div>
        )}

        <div
          className="sf-page-header"
          style={{
            marginTop:
              '1.5rem',
          }}
        >
          <div>
            <h2 className="sf-section-heading">
              Reminder history
            </h2>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="sf-empty">
            No completed or cancelled reminders yet.
          </div>
        ) : (
          <div
            style={{
              display:
                'grid',

              gap:
                '0.7rem',
            }}
          >
            {history.map(
              (reminder) => (
                <div
                  className="sf-summary-block"
                  key={
                    reminder.reminder_id
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
                      <strong>
                        {reminder.product_title}
                      </strong>

                      <div className="sf-muted">
                        {reminder.invoice_number}
                        {' · '}
                        reminder{' '}
                        {formatDate(
                          reminder.reminder_date
                        )}
                      </div>
                    </div>

                    <span
                      className={
                        stateClass(
                          reminder.reminder_state
                        )
                      }
                    >
                      {stateLabel(
                        reminder.reminder_state
                      )}
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
