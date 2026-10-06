// Finalize the user-authorized PostgreSQL dataset after a complete backup.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const dotenv = require('dotenv');
const project = path.resolve(__dirname, '../..');
const directory = path.join(project, 'database/final-postgresql-20261003');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
async function main() {
  assert.equal(process.argv[2], '--apply', 'Use --apply after reviewing the audit reports');
  const local = dotenv.parse(fs.readFileSync(path.join(project, 'portable/backend.env.reference')));
  assert.equal(local.DB_NAME, 'medsenseai_pharm');
  assert.ok(['localhost', '127.0.0.1'].includes(local.DB_HOST));
  const before = JSON.parse(fs.readFileSync(path.join(directory, 'local-before.json')));
  const cloud = JSON.parse(fs.readFileSync(path.join(directory, 'neon-final.json')));
  const live = before.relations.filter(row => row.schema === 'public');
  for (const source of cloud.relations.filter(row => row.schema === 'medsense_app')) {
    const target = live.find(row => row.name === source.name);
    assert.ok(target, `Missing application relation ${source.name}; do not switch`);
    assert.equal(target.checksum, source.checksum, `Latest data differs for ${source.name}; do not switch`);
  }
  assert.ok(!fs.existsSync(path.join(directory, 'applied.json')), 'Already finalized');
  const backendPath = path.join(project, 'backend/.env');
  const aiPath = path.join(project, 'ai_service/.env');
  fs.copyFileSync(backendPath, path.join(directory, 'backend.env.before-final'));
  fs.copyFileSync(aiPath, path.join(directory, 'ai.env.before-final'));
  const pgEnvironment = {...process.env, PGHOST:local.DB_HOST, PGPORT:local.DB_PORT || '5432',
    PGDATABASE:local.DB_NAME, PGUSER:local.DB_USER, PGPASSWORD:local.DB_PASSWORD, PGSSLMODE:'disable'};
  execFileSync('C:/Program Files/PostgreSQL/18/bin/pg_dump.exe',
    ['--format=custom', '--file', path.join(directory, 'complete-before-cleanup.backup')],
    {env:pgEnvironment,windowsHide:true,stdio:['ignore','ignore','pipe'],timeout:240000});
  const client = new Client({host:local.DB_HOST,port:Number(local.DB_PORT || 5432),
    database:local.DB_NAME,user:local.DB_USER,password:local.DB_PASSWORD});
  const removed = [];
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='10s'");
    await client.query("SET TIME ZONE 'UTC'");
    const baseTables = live.filter(row => row.kind === 'r');
    for (const table of baseTables) await client.query(`LOCK TABLE public.${quote(table.name)} IN SHARE MODE`);
    for (const table of baseTables) {
      const current = (await client.query(`SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) checksum FROM public.${quote(table.name)} t`)).rows[0];
      assert.equal(current.checksum, table.checksum, `${table.name} changed since the audit; audit again`);
    }
    // These empty legacy placeholders have no runtime consumers. RESTRICT protects dependencies.
    for (const name of ['staff', 'medicines', 'stock_history_legacy_pre_latest']) {
      assert.equal(live.find(row => row.name === name)?.count, 0, `Refusing to remove nonempty ${name}`);
      await client.query(`DROP TABLE public.${quote(name)} RESTRICT`);
      removed.push('public.' + name);
    }
    const archives = [...new Set(before.relations.map(row => row.schema))]
      .filter(schema => schema.startsWith('public_before_neon_') || schema === 'ai_archive');
    for (const schema of archives) {
      const dependencies = (await client.query(`SELECT DISTINCT dependent_ns.nspname schema,dependent.relname name
        FROM pg_depend d JOIN pg_class referenced ON d.refclassid='pg_class'::regclass AND d.refobjid=referenced.oid
        JOIN pg_namespace referenced_ns ON referenced_ns.oid=referenced.relnamespace
        JOIN pg_rewrite rewrite ON d.classid='pg_rewrite'::regclass AND d.objid=rewrite.oid
        JOIN pg_class dependent ON dependent.oid=rewrite.ev_class
        JOIN pg_namespace dependent_ns ON dependent_ns.oid=dependent.relnamespace
        WHERE referenced_ns.nspname=$1 AND dependent_ns.nspname<>$1`, [schema])).rows;
      assert.equal(dependencies.length, 0, `Archive ${schema} has external view dependencies`);
      await client.query(`DROP SCHEMA ${quote(schema)} CASCADE`);
      removed.push(schema + ' (backed-up archive)');
    }
    const activeAfter = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    assert.equal(activeAfter.length, baseTables.length - 3);
    await client.query('COMMIT');
    const backend = dotenv.parse(fs.readFileSync(backendPath));
    for (const key of ['DB_HOST','DB_PORT','DB_USER','DB_PASSWORD','DB_NAME']) backend[key] = local[key];
    backend.DB_SCHEMA = 'public'; backend.DB_SSL = 'false'; backend.PGSSLMODE = 'disable';
    fs.writeFileSync(backendPath, Object.entries(backend).map(([key,value]) => key + '=' + JSON.stringify(value)).join('\n') + '\n');
    const databaseUrl = `postgresql+psycopg://${encodeURIComponent(local.DB_USER)}:${encodeURIComponent(local.DB_PASSWORD)}@${local.DB_HOST}:${local.DB_PORT || 5432}/${local.DB_NAME}?options=-csearch_path%3Dpublic`;
    const ai = fs.readFileSync(aiPath,'utf8');
    assert.match(ai, /^MEDSENSE_DATABASE_URL=.*$/m);
    fs.writeFileSync(aiPath, ai.replace(/^MEDSENSE_DATABASE_URL=.*$/m, 'MEDSENSE_DATABASE_URL=' + JSON.stringify(databaseUrl)));
    const report = {appliedAt:new Date().toISOString(),database:local.DB_NAME,schema:'public',
      latestCloudSnapshotMatches:true,removed,activeTables:activeAfter.map(row => row.tablename),
      backup:'complete-before-cleanup.backup'};
    fs.writeFileSync(path.join(directory,'applied.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { await client.end(); }
}
main().catch(error => {console.error(error.message); process.exitCode=1;});
