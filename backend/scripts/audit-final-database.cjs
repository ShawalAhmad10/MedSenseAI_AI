const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const dotenv = require('dotenv');
const project = path.resolve(__dirname, '../..');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
async function main() {
  const file = process.argv[2] || path.join(project, 'backend/.env');
  const env = dotenv.parse(fs.readFileSync(file));
  const client = new Client({host:env.DB_HOST, port:Number(env.DB_PORT || 5432), database:env.DB_NAME,
    user:env.DB_USER, password:env.DB_PASSWORD, connectionTimeoutMillis:20000,
    ssl:env.DB_SSL === 'true' ? {rejectUnauthorized:env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'} : false});
  try {
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET TIME ZONE 'UTC'");
    const relations = (await client.query(`SELECT n.nspname schema,c.relname name,c.relkind kind
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r','v','m') ORDER BY 1,2`)).rows;
    const statements = relations.map((relation, index) => {
      const table = quote(relation.schema) + '.' + quote(relation.name);
      return `SELECT ${index} position,count(*)::int count,
        md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) checksum FROM ${table} t`;
    });
    if (statements.length) for (const row of (await client.query(statements.join(' UNION ALL '))).rows) {
      Object.assign(relations[row.position], {count:row.count, checksum:row.checksum});
    }
    const report = {checkedAt:new Date().toISOString(), host:env.DB_HOST, database:env.DB_NAME,
      configuredSchema:env.DB_SCHEMA || 'public', relations};
    if (process.argv[3]) {
      fs.writeFileSync(process.argv[3], JSON.stringify(report, null, 2));
      console.log(JSON.stringify({saved:process.argv[3],database:report.database,relations:relations.length}));
    } else console.log(JSON.stringify(report, null, 2));
    await client.query('ROLLBACK');
  } finally { await client.end(); }
}
main().catch(error => {console.error(error.message); process.exitCode=1;});
