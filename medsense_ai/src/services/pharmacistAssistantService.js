import api from './api';

export async function askPharmacistAssistant(message) {
  const cleanMessage =
    String(message || '').trim();

  if (!cleanMessage) {
    throw new Error(
      'Please enter a question.'
    );
  }

  if (cleanMessage.length > 500) {
    throw new Error(
      'Question must be 500 characters or fewer.'
    );
  }

  const response =
    await api.post(
      '/assistant/ask',
      {
        message: cleanMessage,
      }
    );

  const payload =
    response?.data;

  if (
    !payload ||
    payload.success !== true ||
    typeof payload.reply !== 'string' ||
    !payload.reply.trim() ||
    !payload.data
  ) {
    throw new Error(
      'The AI Assistant returned an invalid response.'
    );
  }

  return {
    reply:
      payload.reply,

    intent:
      payload.data.intent || null,

    parameters:
      payload.data.parameters || {},

    evidence:
      payload.data.evidence || null,

    dataAsOf:
      payload.data.data_as_of || null,

    limitations:
      Array.isArray(
        payload.data.limitations
      )
        ? payload.data.limitations
        : [],
  };
}

export function assistantErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    'The grounded AI Assistant is temporarily unavailable.'
  );
}