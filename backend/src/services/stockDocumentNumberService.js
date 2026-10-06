const { sequelize } = require('../config/database');
const domains = {
  stock: ['stock', 'stock_number', 'STK'],
  opening: ['stock_history_open', 'opening_number', 'OPEN'],
  returns: ['stock_return', 'return_number', 'SRET'],
  bill: ['stock', 'bill_no', 'BILL'],
  batch: ['stock_history', 'batch_number', 'BATCH'],
};
function formatDocumentNumber(value) {
  return String(value || '').replace(/^([A-Z]+)-0*(\d+)$/, (_, prefix, n) => `${prefix}-${n.padStart(3, '0')}`);
}
async function nextDocumentNumber(domain, transaction) {
  if (!transaction) throw new Error('Document numbering requires a transaction');
  const config = domains[domain];
  if (!config) throw new Error('Unknown document numbering domain');
  const [table, column, prefix] = config;
  await sequelize.query('SELECT pg_advisory_xact_lock(44201,17001)', { transaction });
  const [row] = await sequelize.query(`SELECT COALESCE(MAX(substring(${column} from '[0-9]+$')::bigint),0)::text AS last
    FROM ${table} WHERE ${column} ~ :pattern`, {
    replacements: { pattern: `^${prefix}-[0-9]+$` }, type: sequelize.QueryTypes.SELECT, transaction,
  });
  return `${prefix}-${String(BigInt(row.last) + 1n).padStart(3, '0')}`;
}
module.exports = { nextDocumentNumber, formatDocumentNumber };
