const {
  sequelize,
} = require('../config/database');

function normalizeMedicineText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsWholePhrase(
  normalizedMessage,
  normalizedCandidate
) {
  if (
    !normalizedMessage ||
    !normalizedCandidate
  ) {
    return false;
  }

  return (
    ` ${normalizedMessage} `
      .includes(
        ` ${normalizedCandidate} `
      )
  );
}

const IGNORED_BASE_TOKENS =
  new Set([
    'tablet',
    'tablets',
    'capsule',
    'capsules',
    'syrup',
    'injection',
    'medicine',
    'medicines',
  ]);

function medicineMatchScore(
  row,
  normalizedMessage
) {
  let best = 0;

  const fullCandidates = [
    {
      value:
        row.product_title,
      base:
        300,
    },
    {
      value:
        row.product_generic_name,
      base:
        260,
    },
    {
      value:
        row.product_salt,
      base:
        250,
    },
  ];

  for (
    const candidate
    of fullCandidates
  ) {
    const normalized =
      normalizeMedicineText(
        candidate.value
      );

    if (
      normalized.length >= 3 &&
      containsWholePhrase(
        normalizedMessage,
        normalized
      )
    ) {
      best =
        Math.max(
          best,
          candidate.base +
            normalized.length
        );
    }
  }

  const title =
    normalizeMedicineText(
      row.product_title
    );

  const firstTitleToken =
    title
      .split(' ')
      .filter(Boolean)[0] ||
    '';

  if (
    firstTitleToken.length >= 4 &&
    !IGNORED_BASE_TOKENS.has(
      firstTitleToken
    ) &&
    containsWholePhrase(
      normalizedMessage,
      firstTitleToken
    )
  ) {
    best =
      Math.max(
        best,
        150 +
          firstTitleToken.length
      );
  }

  return best;
}

function selectMedicineRows(
  rows,
  rawMessage
) {
  const normalizedMessage =
    normalizeMedicineText(
      rawMessage
    );

  if (
    !normalizedMessage ||
    !Array.isArray(rows)
  ) {
    return {
      status:
        'NOT_FOUND',

      rows:
        [],
    };
  }

  const scored =
    rows
      .map(
        (row) => ({
          row,

          score:
            medicineMatchScore(
              row,
              normalizedMessage
            ),
        })
      )
      .filter(
        (item) =>
          item.score > 0
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          Number(
            a.row.product_id
          ) -
            Number(
              b.row.product_id
            )
      );

  if (
    scored.length === 0
  ) {
    return {
      status:
        'NOT_FOUND',

      rows:
        [],
    };
  }

  const bestScore =
    scored[0].score;

  const best =
    scored
      .filter(
        (item) =>
          item.score ===
          bestScore
      )
      .map(
        (item) =>
          item.row
      )
      .slice(
        0,
        5
      );

  return {
    status:
      best.length === 1
        ? 'FOUND'
        : 'AMBIGUOUS',

    rows:
      best,
  };
}

function mapMedicineRow(row) {
  return {
    product_id:
      Number(
        row.product_id
      ),

    product_title:
      row.product_title ||
      null,

    product_generic_name:
      row.product_generic_name ||
      null,

    product_salt:
      row.product_salt ||
      null,

    product_category:
      row.product_category ||
      null,

    product_requires_rx:
      row.product_requires_rx ==
      null
        ? null
        : Boolean(
            row.product_requires_rx
          ),

    stock_quantity:
      Number(
        row.stock_quantity ||
        0
      ),
  };
}

async function medicineInfoEvidence(
  rawMessage
) {
  const [rows] =
    await sequelize.query(
      `
        SELECT
          p.product_id,
          p.product_title,
          p.product_generic_name,
          p.product_salt,
          p.product_category,
          p.product_requires_rx,

          COALESCE(
            SUM(
              sh.remaining_quantity
            ),
            0
          )::int
            AS stock_quantity

        FROM product p

        LEFT JOIN stock_history sh
          ON sh.product_id =
             p.product_id
         AND sh.status = 1

        WHERE p.product_status = 1

        GROUP BY
          p.product_id,
          p.product_title,
          p.product_generic_name,
          p.product_salt,
          p.product_category,
          p.product_requires_rx

        ORDER BY
          p.product_id ASC
      `
    );

  const selected =
    selectMedicineRows(
      rows,
      rawMessage
    );

  const mapped =
    selected.rows.map(
      mapMedicineRow
    );

  return {
    rows:
      mapped,

    summary: {
      status:
        selected.status,

      matches:
        mapped.length,
    },

    presentation:
      'medicine_info',
  };
}

module.exports = {
  medicineInfoEvidence,
  normalizeMedicineText,
  selectMedicineRows,
};