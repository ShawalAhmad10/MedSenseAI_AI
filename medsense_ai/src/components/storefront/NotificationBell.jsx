import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Bell,
  CircleAlert,
  CircleCheck,
  Clock3,
  X,
} from 'lucide-react';

import {
  Link,
} from 'react-router-dom';

import {
  useAuth,
} from '../../context/AuthContext';

import {
  getCustomerOrders,
} from '../../services/storefrontOrderService';

import {
  getRefillReminders,
} from '../../services/storefrontRefillService';

const iconMap = {
  high:
    CircleAlert,

  medium:
    Clock3,

  low:
    CircleCheck,
};

function formatNotificationDate(
  value
) {
  if (!value) {
    return '';
  }

  const parsed =
    new Date(value);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return '';
  }

  return parsed.toLocaleDateString(
    'en-US',
    {
      month:
        'short',

      day:
        'numeric',
    }
  );
}

function mapOrderNotification(
  order
) {
  const isPending =
    [
      'pending',
      'confirmed',
      'processing',
    ].includes(
      order.delivery_status
    );

  const isDelivered =
    order.delivery_status ===
    'delivered';

  return {
    id:
      `order-${order.invoice_id}`,

    title:
      isPending
        ? 'Order In Progress'
        : isDelivered
          ? 'Order Delivered'
          : 'Order Update',

    message:
      isPending
        ? `Your order ${order.invoice_number} is being prepared`
        : isDelivered
          ? `Order ${order.invoice_number} has been delivered - PKR ${order.total_amount}`
          : `Order ${order.invoice_number} status: ${order.delivery_status}`,

    date:
      formatNotificationDate(
        order.created_at
      ),

    severity:
      isPending
        ? 'medium'
        : isDelivered
          ? 'low'
          : 'high',

    href:
      '/orders',

    kind:
      'order',
  };
}

function mapRefillNotification(
  reminder
) {
  const state =
    String(
      reminder.reminder_state ||
      ''
    ).toUpperCase();

  if (
    reminder.lifecycle_status !==
    'active'
  ) {
    return null;
  }

  if (
    state !== 'DUE_TODAY' &&
    state !== 'OVERDUE'
  ) {
    return null;
  }

  const productTitle =
    reminder.product_title ||
    'medicine';

  return {
    id:
      `refill-${reminder.reminder_id}`,

    title:
      state === 'OVERDUE'
        ? 'Refill Reminder Overdue'
        : 'Refill Reminder Due Today',

    message:
      state === 'OVERDUE'
        ? `Your selected reminder date for ${productTitle} has passed.`
        : `Your selected reminder date for ${productTitle} is today.`,

    date:
      formatNotificationDate(
        reminder.reminder_date
      ),

    severity:
      state === 'OVERDUE'
        ? 'high'
        : 'medium',

    href:
      '/refills',

    kind:
      'refill',
  };
}

export default function NotificationBell() {
  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    notifications,
    setNotifications,
  ] = useState([]);

  const {
    user,
  } = useAuth();

  useEffect(
    () => {
      let active =
        true;

      async function loadNotifications() {
        if (!user) {
          if (active) {
            setNotifications([]);
          }

          return;
        }

        let orderNotifications =
          [];

        let refillNotifications =
          [];

        try {
          const ordersRes =
            await getCustomerOrders(
              user.id,
              user.email,
              user.phone
            );

          const orders =
            (
              ordersRes.data?.orders ||
              []
            ).slice(
              0,
              5
            );

          orderNotifications =
            orders.map(
              mapOrderNotification
            );
        } catch (error) {
          console.error(
            'Failed to load order notifications:',
            error
          );
        }

        try {
          const reminders =
            await getRefillReminders();

          refillNotifications =
            (
              Array.isArray(
                reminders
              )
                ? reminders
                : []
            )
              .map(
                mapRefillNotification
              )
              .filter(Boolean);
        } catch (error) {
          console.error(
            'Failed to load refill notifications:',
            error
          );
        }

        if (active) {
          setNotifications([
            ...refillNotifications,
            ...orderNotifications,
          ]);
        }
      }

      void loadNotifications();

      const interval =
        window.setInterval(
          loadNotifications,
          30000
        );

      return () => {
        active =
          false;

        window.clearInterval(
          interval
        );
      };
    },
    [
      user,
    ]
  );

  const unreadCount =
    useMemo(
      () =>
        notifications.filter(
          (notification) =>
            notification.severity !==
            'low'
        ).length,
      [
        notifications,
      ]
    );

  if (!user) {
    return (
      <button
        aria-label="Open notifications"
        className="sf-icon-button"
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        style={{
          position:
            'relative',
        }}
        type="button"
      >
        <Bell size={18} />

        {open && (
          <>
            <div
              className="sf-overlay"
              onClick={() =>
                setOpen(false)
              }
              style={{
                zIndex:
                  88,

                background:
                  'transparent',
              }}
            />

            <div
              className="sf-card"
              style={{
                position:
                  'fixed',

                top:
                  84,

                right:
                  16,

                zIndex:
                  89,

                width:
                  'min(calc(100vw - 1rem), 380px)',

                padding:
                  '1rem',
              }}
            >
              <div
                style={{
                  textAlign:
                    'center',

                  padding:
                    '2rem 1rem',
                }}
              >
                <Bell
                  color="var(--sf-muted)"
                  size={32}
                  style={{
                    margin:
                      '0 auto 1rem',
                  }}
                />

                <p
                  style={{
                    color:
                      'var(--sf-muted)',
                  }}
                >
                  Sign in to see your notifications
                </p>
              </div>
            </div>
          </>
        )}
      </button>
    );
  }

  return (
    <>
      <button
        aria-label="Open notifications"
        className="sf-icon-button"
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        style={{
          position:
            'relative',
        }}
        type="button"
      >
        <Bell size={18} />

        {unreadCount > 0 && (
          <span
            style={{
              position:
                'absolute',

              top:
                -4,

              right:
                -4,

              minWidth:
                18,

              height:
                18,

              borderRadius:
                999,

              background:
                'var(--sf-danger)',

              color:
                'white',

              display:
                'inline-flex',

              alignItems:
                'center',

              justifyContent:
                'center',

              fontSize:
                '0.68rem',

              fontWeight:
                800,

              padding:
                '0 0.2rem',
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="sf-overlay"
            onClick={() =>
              setOpen(false)
            }
            style={{
              zIndex:
                88,

              background:
                'transparent',
            }}
          />

          <div
            className="sf-card"
            style={{
              position:
                'fixed',

              top:
                84,

              right:
                16,

              zIndex:
                89,

              width:
                'min(calc(100vw - 1rem), 380px)',

              padding:
                '1rem',
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

                alignItems:
                  'center',

                marginBottom:
                  '0.9rem',
              }}
            >
              <div>
                <strong
                  style={{
                    display:
                      'block',

                    fontFamily:
                      'var(--font-display)',
                  }}
                >
                  Notifications
                </strong>

                <span
                  className="sf-muted"
                  style={{
                    fontSize:
                      '0.82rem',
                  }}
                >
                  Order updates and due refill reminders
                </span>
              </div>

              <button
                className="sf-icon-button"
                onClick={() =>
                  setOpen(false)
                }
                type="button"
              >
                <X size={16} />
              </button>
            </div>

            <div
              style={{
                display:
                  'grid',

                gap:
                  '0.75rem',

                maxHeight:
                  360,

                overflowY:
                  'auto',
              }}
            >
              {notifications.length ===
              0 ? (
                <div
                  style={{
                    textAlign:
                      'center',

                    padding:
                      '2rem 1rem',

                    color:
                      'var(--sf-muted)',
                  }}
                >
                  <Bell
                    size={32}
                    style={{
                      margin:
                        '0 auto 1rem',

                      opacity:
                        0.5,
                    }}
                  />

                  <p>
                    No notifications yet
                  </p>

                  <p
                    style={{
                      fontSize:
                        '0.85rem',

                      marginTop:
                        '0.5rem',
                    }}
                  >
                    Order updates and due refill reminders will appear here.
                  </p>
                </div>
              ) : (
                notifications.map(
                  (
                    notification
                  ) => {
                    const Icon =
                      iconMap[
                        notification
                          .severity
                      ] ||
                      Clock3;

                    return (
                      <Link
                        key={
                          notification.id
                        }
                        onClick={() =>
                          setOpen(
                            false
                          )
                        }
                        style={{
                          textDecoration:
                            'none',

                          color:
                            'inherit',

                          padding:
                            '0.9rem',

                          borderRadius:
                            18,

                          background:
                            'var(--sf-surface-alt)',

                          border:
                            '1px solid var(--sf-border)',

                          display:
                            'grid',

                          gap:
                            '0.4rem',
                        }}
                        to={
                          notification.href
                        }
                      >
                        <div
                          style={{
                            display:
                              'flex',

                            justifyContent:
                              'space-between',

                            gap:
                              '0.75rem',
                          }}
                        >
                          <span
                            style={{
                              display:
                                'inline-flex',

                              alignItems:
                                'center',

                              gap:
                                '0.4rem',
                            }}
                          >
                            <Icon
                              color={
                                notification.severity ===
                                'high'
                                  ? 'var(--sf-danger)'
                                  : notification.severity ===
                                      'medium'
                                    ? 'var(--sf-warning)'
                                    : 'var(--sf-success)'
                              }
                              size={14}
                            />

                            <strong>
                              {notification.title}
                            </strong>
                          </span>

                          <span
                            className={
                              notification.severity ===
                              'high'
                                ? 'sf-badge-danger'
                                : notification.severity ===
                                    'medium'
                                  ? 'sf-badge-warning'
                                  : 'sf-badge-success'
                            }
                          >
                            {notification.date}
                          </span>
                        </div>

                        <span
                          className="sf-muted"
                          style={{
                            fontSize:
                              '0.88rem',

                            lineHeight:
                              1.6,
                          }}
                        >
                          {notification.message}
                        </span>
                      </Link>
                    );
                  }
                )
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
