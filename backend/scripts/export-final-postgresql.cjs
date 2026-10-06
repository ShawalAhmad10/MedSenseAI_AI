const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {Client} = require('pg');
const dotenv = require('dotenv');
const project = path.resolve(__dirname,'../..');
const directory = path.join(project,'database/final-postgresql-20261003');
const quote = value => '"'+value.replaceAll('"','""')+'"';
async function manifest(client) {
  await client.query("SET TIME ZONE 'UTC'");
  const rows = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const data = {};
  for (const {tablename} of rows) data[tablename] = (await client.query(`SELECT count(*)::int count,
    md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) checksum FROM public.${quote(tablename)} t`)).rows[0];
  const sequences = {};
  for (const {sequencename} of (await client.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows)
    sequences[sequencename] = (await client.query(`SELECT last_value::text,is_called FROM public.${quote(sequencename)}`)).rows[0];
  return {tables:data,sequences};
}
async function main() {
  const env = dotenv.parse(fs.readFileSync(path.join(project,'backend/.env')));
  assert.equal(env.DB_NAME,'medsenseai_pharm'); assert.equal(env.DB_SCHEMA,'public');
  assert.ok(['localhost','127.0.0.1'].includes(env.DB_HOST));
  const config={host:env.DB_HOST,port:Number(env.DB_PORT || 5432),user:env.DB_USER,password:env.DB_PASSWORD};
  const pgEnvironment={...process.env,PGHOST:env.DB_HOST,PGPORT:env.DB_PORT || '5432',PGUSER:env.DB_USER,PGPASSWORD:env.DB_PASSWORD,PGSSLMODE:'disable'};
  const run=(name,args)=>execFileSync(`C:/Program Files/PostgreSQL/18/bin/${name}.exe`,args,
    {env:pgEnvironment,windowsHide:true,stdio:['ignore','ignore','pipe'],timeout:240000});
  const maintenance = new Client({...config,database:'postgres'});
  const source = new Client({...config,database:env.DB_NAME});
  const restoreName = 'medsenseai_restore_check_'+Date.now();
  let restored, created = false;
  try {
    await maintenance.connect(); await source.connect();
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot=(await source.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
    const current=await manifest(source);
    const backup=path.join(directory,'final-handoff.backup');
    run('pg_dump',['--dbname',env.DB_NAME,'--snapshot',snapshot,'--format=custom','--file',backup]);
    await source.query('ROLLBACK');
    await maintenance.query(`CREATE DATABASE ${quote(restoreName)}`); created=true;
    run('pg_restore',['--dbname',restoreName,'--single-transaction','--no-owner','--no-privileges','--exit-on-error',backup]);
    restored = new Client({...config,database:restoreName}); await restored.connect();
    assert.deepEqual(await manifest(restored),current,'Restored backup must match all table checksums and sequences');
    const handoff=path.join(project,'database/medsenseai_pharm_full.backup');
    const previous=path.join(directory,'previous-handoff.backup');
    if (fs.existsSync(handoff) && !fs.existsSync(previous)) fs.copyFileSync(handoff,previous);
    fs.copyFileSync(backup,handoff);
    const report={exportedAt:new Date().toISOString(),database:env.DB_NAME,schema:'public',
      tables:Object.keys(current.tables).length,allRowsAndSequencesMatchRestoredBackup:true,
      handoffBackup:'database/medsenseai_pharm_full.backup',manifest:current};
    fs.writeFileSync(path.join(directory,'handoff-verification.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({result:'PASS',tables:report.tables,restoreDrill:'all rows and sequences match',backup:report.handoffBackup}));
  } finally {
    if (restored) await restored.end();
    await source.end();
    if (created) await maintenance.query(`DROP DATABASE ${quote(restoreName)}`);
    await maintenance.end();
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
