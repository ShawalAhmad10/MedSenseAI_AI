const INTENTS = [
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'INVENTORY_STATUS',
  'SALES_SUMMARY',
  'SALES_TREND',
  'TOP_MEDICINES',
  'ALERTS',
  'REFILLS_DUE',
  'MEDICINE_INFO',
  'DDI_REDIRECT',
  'UNSUPPORTED',
];

const MODEL =
  'local-bounded-intent-v1';

const LOCAL_CLASSIFIER_ID =
  MODEL;

function providerError(
  code,
  message
) {
  const error =
    new Error(message);

  error.code =
    code;

  return error;
}

function boundedInteger(
  value,
  fallback,
  min,
  max
) {
  const parsed =
    Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < min ||
    parsed > max
  ) {
    return fallback;
  }

  return parsed;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeClassification(
  payload
) {
  if (
    !payload ||
    typeof payload !== 'object'
  ) {
    throw providerError(
      'ASSISTANT_CLASSIFIER_INVALID_RESPONSE',
      'Assistant classifier returned an invalid response'
    );
  }

  const intent =
    String(
      payload.intent || ''
    ).toUpperCase();

  if (
    !INTENTS.includes(intent)
  ) {
    throw providerError(
      'ASSISTANT_CLASSIFIER_INVALID_RESPONSE',
      'Assistant classifier returned an unsupported intent'
    );
  }

  const defaultDays =
    intent ===
      'TOP_MEDICINES'
      ? 30
      : 7;

  return {
    intent,

    days:
      boundedInteger(
        payload.days,
        defaultDays,
        1,
        90
      ),

    limit:
      boundedInteger(
        payload.limit,
        10,
        1,
        20
      ),
  };
}

function parseDays(
  message,
  intent
) {
  const fallback =
    intent ===
      'TOP_MEDICINES'
      ? 30
      : 7;

  if (
    /\btoday\b/.test(
      message
    )
  ) {
    return 1;
  }

  if (
    /\b(?:this|last|previous)\s+week\b/.test(
      message
    )
  ) {
    return 7;
  }

  if (
    /\b(?:this|last|previous)\s+month\b/.test(
      message
    )
  ) {
    return 30;
  }

  if (
    /\b(?:this|last|previous)\s+quarter\b/.test(
      message
    )
  ) {
    return 90;
  }

  const explicit =
    message.match(
      /\b(?:last|past|previous|for)?\s*(\d{1,3})\s*(?:day|days)\b/
    );

  if (explicit) {
    return boundedInteger(
      Number(
        explicit[1]
      ),
      fallback,
      1,
      90
    );
  }

  return fallback;
}

function parseLimit(
  message,
  intent
) {
  if (
    intent !==
    'TOP_MEDICINES'
  ) {
    return 10;
  }

  const match =
    message.match(
      /\btop\s+(\d{1,2})\b/
    );

  if (!match) {
    return 10;
  }

  return boundedInteger(
    Number(
      match[1]
    ),
    10,
    1,
    20
  );
}

function hasAny(
  message,
  patterns
) {
  return patterns.some(
    (pattern) =>
      pattern.test(message)
  );
}

function detectIntent(
  message
) {

  // ==================================================
  // SAFETY PRIORITY 1:
  // DDI / medicine-combination questions must never
  // be answered as ordinary medicine information.
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\bddi\b/,
        /\bdrug[- ]?drug\b/,
        /\binteraction\b/,
        /\binteractions\b/,
        /\binteract\b/,
        /\bcombination\b/,
        /\btogether\b/,
        /\bcompatible\b/,
        /\binteraction safety\b/,
        /\bcan i (?:take|use).+\b(?:with|and)\b/,
        /\bsafe\b.+\b(?:with|together|and)\b/,
        /\b(?:with|together|and)\b.+\bsafe\b/,
        /\bsaath\b/,
        /\bsath\b/,
      ]
    )
  ) {
    return 'DDI_REDIRECT';
  }


  // ==================================================
  // SAFETY PRIORITY 2:
  // No diagnosis, dose advice or clinical substitution.
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\bdose\b/,
        /\bdosage\b/,
        /\bkitni dose\b/,
        /\bhow much (?:should|can) i take\b/,
        /\bhow many (?:tablets|capsules|pills)\b/,
        /\bwhen should i take\b/,
        /\bdiagnos/,
        /\bdiagnosis\b/,
        /\bwhat disease\b/,
        /\bwhat should i take for\b/,
        /\btreat my\b/,
        /\bclinical substitution\b/,
        /\bsubstitute\b/,
        /\breplace .* medicine\b/,
        /\bsafer alternative\b/,
      ]
    )
  ) {
    return 'UNSUPPORTED';
  }


  // ==================================================
  // REFILLS
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\brefill\b/,
        /\brefills\b/,
        /\brefill reminder\b/,
        /\brefill reminders\b/,
        /\bdue refill\b/,
        /\boverdue refill\b/,
      ]
    )
  ) {
    return 'REFILLS_DUE';
  }


  // ==================================================
  // SPECIFIC INVENTORY STATES
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\bout[- ]of[- ]stock\b/,
        /\bout of stock\b/,
        /\bzero stock\b/,
        /\bno stock\b/,
      ]
    )
  ) {
    return 'OUT_OF_STOCK';
  }

  if (
    hasAny(
      message,
      [
        /\blow[- ]stock\b/,
        /\blow stock\b/,
        /\brunning low\b/,
        /\bbelow minimum\b/,
        /\bbelow threshold\b/,
      ]
    )
  ) {
    return 'LOW_STOCK';
  }


  // ==================================================
  // ALERTS / EXPIRY
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\balert\b/,
        /\balerts\b/,
        /\bexpiry\b/,
        /\bexpire\b/,
        /\bexpired\b/,
        /\bexpiring\b/,
      ]
    )
  ) {
    return 'ALERTS';
  }


  // ==================================================
  // TOP MEDICINES
  // Must precede generic sales matching.
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\btop\s+\d*\s*(?:medicine|medicines|product|products)\b/,
        /\btop medicines\b/,
        /\btop products\b/,
        /\bbest[- ]selling\b/,
        /\bmost[- ]sold\b/,
        /\bhighest[- ]selling\b/,
        /\bmedicine demand\b/,
      ]
    )
  ) {
    return 'TOP_MEDICINES';
  }


  // ==================================================
  // SALES TREND
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\bsales trend\b/,
        /\bsales trends\b/,
        /\bdaily sales\b/,
        /\bsales over time\b/,
        /\bsales pattern\b/,
        /\bsales history\b/,
      ]
    )
  ) {
    return 'SALES_TREND';
  }


  // ==================================================
  // SALES SUMMARY
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\bsales summary\b/,
        /\bsales overview\b/,
        /\brevenue summary\b/,
        /\brecorded sales\b/,
        /\bcash received\b/,
        /\boutstanding amount\b/,
        /\border summary\b/,
        /\bsales\b/,
        /\brevenue\b/,
      ]
    )
  ) {
    return 'SALES_SUMMARY';
  }


  // ==================================================
  // MEDICINE / PRODUCT INFORMATION
  // This is catalogue information only.
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\btell me about\b/,
        /\bmedicine details\b/,
        /\bdrug details\b/,
        /\bproduct details\b/,
        /\bmedicine info\b/,
        /\bmedicine information\b/,
        /\bgeneric name\b/,
        /\bgeneric\b/,
        /\bsalt\b/,
        /\bactive ingredient\b/,
        /\bingredient\b/,
        /\bprescription medicine\b/,
        /\brequires prescription\b/,
        /\bprescription required\b/,
        /\brx required\b/,
        /\bstock of\b/,
      ]
    )
  ) {
    return 'MEDICINE_INFO';
  }


  // ==================================================
  // GENERAL INVENTORY
  // ==================================================

  if (
    hasAny(
      message,
      [
        /\binventory status\b/,
        /\binventory overview\b/,
        /\bcurrent inventory\b/,
        /\bstock status\b/,
        /\bstock overview\b/,
        /\bcurrent stock\b/,
        /\binventory\b/,
      ]
    )
  ) {
    return 'INVENTORY_STATUS';
  }


  // ==================================================
  // FAIL CLOSED
  // ==================================================

  return 'UNSUPPORTED';
}

async function classifyIntent(
  rawMessage
) {
  const message =
    normalizeText(
      rawMessage
    );

  if (!message) {
    throw providerError(
      'ASSISTANT_INVALID_MESSAGE',
      'Assistant question is required'
    );
  }

  const intent =
    detectIntent(
      message
    );

  return normalizeClassification({
    intent,

    days:
      parseDays(
        message,
        intent
      ),

    limit:
      parseLimit(
        message,
        intent
      ),
  });
}

module.exports = {
  INTENTS,
  MODEL,
  LOCAL_CLASSIFIER_ID,
  classifyIntent,
  detectIntent,
  normalizeClassification,
  normalizeText,
  parseDays,
  parseLimit,
};