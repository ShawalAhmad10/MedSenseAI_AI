const { sequelize } =
  require('../config/database');


function requireTransaction(
  transaction
) {
  if (!transaction) {
    const error =
      new Error(
        'Invoice number generation requires an active transaction'
      );

    error.code =
      'INVOICE_NUMBER_TRANSACTION_REQUIRED';

    throw error;
  }
}


async function generateNextInvoiceNumber(
  transaction
) {
  requireTransaction(
    transaction
  );

  // All MedSenseAI invoice-number writers use the same
  // transaction-scoped advisory lock.
  //
  // PostgreSQL releases this automatically on commit/rollback.
  await sequelize.query(
    `
      SELECT
        pg_advisory_xact_lock(
          44201,
          17001
        )
    `,
    {
      transaction
    }
  );

  const last =
    await sequelize.query(
      `
        SELECT invoice_number
        FROM invoice
        WHERE invoice_number ~
              '^INV-[0-9]+$'
        ORDER BY invoice_id DESC
        LIMIT 1
      `,
      {
        type:
          sequelize.QueryTypes.SELECT,
        transaction
      }
    );

  let next = 1;

  if (
    last.length > 0 &&
    last[0]?.invoice_number
  ) {
    const match =
      String(
        last[0].invoice_number
      ).match(
        /^INV-(\d+)$/
      );

    if (match) {
      next =
        Number.parseInt(
          match[1],
          10
        ) + 1;
    }
  }

  return (
    'INV-' +
    String(next)
      .padStart(
        6,
        '0'
      )
  );
}


module.exports = {
  generateNextInvoiceNumber
};
