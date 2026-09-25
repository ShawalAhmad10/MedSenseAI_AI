import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Bot,
  Clock3,
  Database,
  Loader2,
  Send,
  ShieldCheck,
  User,
} from 'lucide-react';

import {
  askPharmacistAssistant,
  assistantErrorMessage,
} from '../../services/pharmacistAssistantService';

const QUICK_PROMPTS = [
  'Show current inventory status',
  'Which medicines are low stock?',
  'Tell me about Brufen',
  'Show sales summary for the last 30 days',
  'What are the top medicines in the last 30 days?',
  'Show current operational alerts',
  'Which refill reminders are due?',
];

function formatTimestamp(value) {
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

  return parsed.toLocaleString();
}

export default function AIAssistant() {
  const [messages, setMessages] =
    useState([
      {
        id: 'welcome',
        role: 'assistant',
        content:
          'Hello. I can answer grounded pharmacy operations questions about medicine catalogue information, inventory, sales, sales trends, top medicines, alerts, and due refill reminders.',
        source:
          'Assistant scope contract',
      },
    ]);

  const [input, setInput] =
    useState('');

  const [isThinking, setIsThinking] =
    useState(false);

  const scrollRef =
    useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop =
        scrollRef.current.scrollHeight;
    }
  }, [
    messages,
    isThinking,
  ]);

  async function sendMessage(
    suppliedMessage = null
  ) {
    const message =
      String(
        suppliedMessage !== null
          ? suppliedMessage
          : input
      ).trim();

    if (
      !message ||
      isThinking
    ) {
      return;
    }

    if (message.length > 500) {
      setMessages(
        (current) => [
          ...current,
          {
            id:
              `error-${Date.now()}`,
            role:
              'assistant',
            content:
              'Question must be 500 characters or fewer.',
            error:
              true,
          },
        ]
      );

      return;
    }

    const userMessage = {
      id:
        `user-${Date.now()}`,

      role:
        'user',

      content:
        message,
    };

    setMessages(
      (current) => [
        ...current,
        userMessage,
      ]
    );

    setInput('');
    setIsThinking(true);

    try {
      const result =
        await askPharmacistAssistant(
          message
        );

      setMessages(
        (current) => [
          ...current,
          {
            id:
              `assistant-${Date.now()}`,

            role:
              'assistant',

            content:
              result.reply,

            intent:
              result.intent,

            source:
              result.evidence?.source ||
              null,

            dataAsOf:
              result.dataAsOf,

            limitations:
              result.limitations,
          },
        ]
      );
    } catch (error) {
      setMessages(
        (current) => [
          ...current,
          {
            id:
              `assistant-error-${Date.now()}`,

            role:
              'assistant',

            content:
              assistantErrorMessage(
                error
              ),

            error:
              true,
          },
        ]
      );
    } finally {
      setIsThinking(false);
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        maxWidth: '980px',
        margin: '0 auto',
      }}
    >
      <div
        style={{
          padding:
            '1.5rem 0 1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems:
              'flex-start',
            justifyContent:
              'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontFamily:
                  'var(--font-display)',
                fontWeight: 800,
                fontSize: '1.5rem',
                color:
                  'var(--navy)',
              }}
            >
              Pharmacy AI Assistant
            </h2>

            <p
              style={{
                margin:
                  '4px 0 0',
                fontSize:
                  '0.85rem',
                color:
                  'var(--gray-400)',
              }}
            >
              Grounded answers from your pharmacy system
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems:
                'center',
              gap: '6px',
              padding:
                '0.45rem 0.75rem',
              borderRadius:
                '999px',
              background:
                '#ecfdf5',
              color:
                '#047857',
              fontSize:
                '0.75rem',
              fontWeight: 700,
            }}
          >
            <ShieldCheck
              size={15}
            />
            Read-only grounded data
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom:
            '1rem',
        }}
      >
        {QUICK_PROMPTS.map(
          (prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={
                isThinking
              }
              onClick={() =>
                sendMessage(
                  prompt
                )
              }
              style={{
                border:
                  '1px solid var(--dash-border)',
                background:
                  'white',
                color:
                  'var(--navy)',
                borderRadius:
                  '999px',
                padding:
                  '0.45rem 0.75rem',
                fontSize:
                  '0.75rem',
                cursor:
                  isThinking
                    ? 'not-allowed'
                    : 'pointer',
                opacity:
                  isThinking
                    ? 0.6
                    : 1,
              }}
            >
              {prompt}
            </button>
          )
        )}
      </div>

      <div
        ref={scrollRef}
        className="no-scrollbar"
        style={{
          flex: 1,
          minHeight: '420px',
          overflowY: 'auto',
          padding: '1rem',
          display: 'flex',
          flexDirection:
            'column',
          gap: '1.25rem',
          background:
            'white',
          borderRadius:
            '20px',
          border:
            '1px solid var(--dash-border)',
          marginBottom:
            '1.25rem',
        }}
      >
        {messages.map(
          (message) => (
            <div
              key={message.id}
              style={{
                alignSelf:
                  message.role ===
                  'user'
                    ? 'flex-end'
                    : 'flex-start',

                maxWidth:
                  '82%',

                display:
                  'flex',

                gap:
                  '10px',

                flexDirection:
                  message.role ===
                  'user'
                    ? 'row-reverse'
                    : 'row',
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius:
                    '50%',
                  flexShrink: 0,
                  background:
                    message.role ===
                    'user'
                      ? 'var(--blue)'
                      : 'var(--dash-bg)',
                  display:
                    'flex',
                  alignItems:
                    'center',
                  justifyContent:
                    'center',
                }}
              >
                {message.role ===
                'user' ? (
                  <User
                    size={18}
                    color="white"
                  />
                ) : (
                  <Bot
                    size={18}
                    color="var(--blue)"
                  />
                )}
              </div>

              <div
                style={{
                  display:
                    'flex',
                  flexDirection:
                    'column',
                  gap: '7px',
                }}
              >
                <div
                  style={{
                    padding:
                      '0.9rem 1rem',

                    borderRadius:
                      message.role ===
                      'user'
                        ? '18px 4px 18px 18px'
                        : '4px 18px 18px 18px',

                    background:
                      message.role ===
                      'user'
                        ? 'var(--blue)'
                        : message.error
                          ? '#fff7ed'
                          : 'var(--dash-bg)',

                    color:
                      message.role ===
                      'user'
                        ? 'white'
                        : 'var(--navy)',

                    fontSize:
                      '0.9rem',

                    lineHeight:
                      1.55,
                  }}
                >
                  {message.content}
                </div>

                {message.role ===
                  'assistant' && (
                  <div
                    style={{
                      display:
                        'flex',
                      flexWrap:
                        'wrap',
                      gap: '8px',
                      paddingLeft:
                        '4px',
                    }}
                  >
                    {message.source && (
                      <span
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap: '4px',
                          fontSize:
                            '0.68rem',
                          color:
                            'var(--gray-400)',
                        }}
                      >
                        <Database
                          size={12}
                        />
                        {
                          message.source
                        }
                      </span>
                    )}

                    {message.dataAsOf && (
                      <span
                        style={{
                          display:
                            'flex',
                          alignItems:
                            'center',
                          gap: '4px',
                          fontSize:
                            '0.68rem',
                          color:
                            'var(--gray-400)',
                        }}
                      >
                        <Clock3
                          size={12}
                        />

                        As of{' '}
                        {formatTimestamp(
                          message.dataAsOf
                        )}
                      </span>
                    )}

                    {message.intent && (
                      <span
                        style={{
                          fontSize:
                            '0.68rem',
                          color:
                            'var(--gray-400)',
                        }}
                      >
                        Intent:{' '}
                        {
                          message.intent
                        }
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {isThinking && (
          <div
            style={{
              alignSelf:
                'flex-start',
              display: 'flex',
              gap: '10px',
              alignItems:
                'center',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius:
                  '50%',
                background:
                  'var(--dash-bg)',
                display:
                  'flex',
                alignItems:
                  'center',
                justifyContent:
                  'center',
              }}
            >
              <Bot
                size={18}
                color="var(--blue)"
              />
            </div>

            <div
              style={{
                padding:
                  '0.75rem 1rem',
                background:
                  'var(--dash-bg)',
                borderRadius:
                  '4px 18px 18px 18px',
                display:
                  'flex',
                alignItems:
                  'center',
                gap: '7px',
              }}
            >
              <Loader2
                size={16}
                className="animate-spin"
              />

              <span
                style={{
                  fontSize:
                    '0.8rem',
                  color:
                    'var(--gray-400)',
                }}
              >
                Loading grounded pharmacy data...
              </span>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          position:
            'relative',
          marginBottom:
            '1.5rem',
        }}
      >
        <input
          value={input}
          maxLength={500}
          disabled={isThinking}
          onChange={(event) =>
            setInput(
              event.target.value
            )
          }
          onKeyDown={(event) => {
            if (
              event.key ===
              'Enter'
            ) {
              event.preventDefault();

              sendMessage();
            }
          }}
          placeholder="Ask about a medicine, inventory, sales, top medicines, alerts, or due refills..."
          className="chat-input"
          style={{
            width: '100%',
            padding:
              '1.1rem 4rem 1.1rem 1.25rem',
            borderRadius:
              '100px',
            border:
              '2px solid var(--dash-border)',
            outline: 'none',
            fontSize:
              '0.95rem',
            background:
              'white',
          }}
        />

        <button
          type="button"
          onClick={() =>
            sendMessage()
          }
          disabled={
            !input.trim() ||
            isThinking
          }
          style={{
            position:
              'absolute',
            right: '8px',
            top: '7px',
            width: '46px',
            height: '46px',
            borderRadius:
              '50%',
            background:
              'var(--navy)',
            color: 'white',
            border: 'none',
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            cursor:
              !input.trim() ||
              isThinking
                ? 'not-allowed'
                : 'pointer',
            opacity:
              !input.trim() ||
              isThinking
                ? 0.5
                : 1,
          }}
        >
          <Send
            size={19}
          />
        </button>
      </div>

      <style>{`
        .chat-input:focus {
          border-color: var(--blue);
          box-shadow: 0 0 0 4px rgba(37,99,235,0.08);
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}