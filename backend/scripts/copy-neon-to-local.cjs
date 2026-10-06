// User-authorized current snapshot into the screenshot's local public schema.
// Neon is read-only. Previous local public is backed up and archived, never dropped.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('pg'),dotenv=require('dotenv'),{execFileSync}=require('node:child_process');
const project=path.resolve(__dirname,'../..'),sourceSchema='medsense_app',pgBin='C:/Program Files/PostgreSQL/18/bin';
const local=dotenv.parse(fs.readFileSync(path.join(project,'portable/backend.env.reference')));
const cloud=dotenv.parse(fs.readFileSync(path.join(project,'backend/.env')));
const config=e=>({host:e.DB_HOST,port:Number(e.DB_PORT||5432),database:e.DB_NAME,user:e.DB_USER,password:e.DB_PASSWORD,ssl:e.DB_SSL==='true'?{rejectUnauthorized:e.DB_SSL_REJECT_UNAUTHORIZED!=='false'}:false,connectionTimeoutMillis:20000});
const pgEnv=e=>({...process.env,PGHOST:e.DB_HOST,PGPORT:e.DB_PORT||'5432',PGDATABASE:e.DB_NAME,PGUSER:e.DB_USER,PGPASSWORD:e.DB_PASSWORD,PGSSLMODE:e.DB_SSL==='true'?'require':'disable'});
const quote=x=>'"'+x.replaceAll('"','""')+'"';
function run(exe,args,env){execFileSync(path.join(pgBin,exe+'.exe'),args,{env:pgEnv(env),windowsHide:true,stdio:['ignore','ignore','pipe'],timeout:240000,maxBuffer:4*1024*1024});}
// Rewrite SQL identifiers and regclass literals, preserving all COPY data verbatim.
function remap(sql){let out='',i=0,copy=false;while(i<sql.length){
 if(copy){const end=sql.indexOf('\n',i),stop=end<0?sql.length:end+1,line=sql.slice(i,stop);out+=line;i=stop;if(line.trim()==='\\.')copy=false;continue;}
 if((i===0||sql[i-1]==='\n')&&sql.startsWith('COPY ',i)&&sql.indexOf('\n',i)>=0){const end=sql.indexOf('\n',i);out+=remap(sql.slice(i,end))+'\n';i=end+1;copy=true;continue;}
 if(sql.startsWith('--',i)){const end=sql.indexOf('\n',i),stop=end<0?sql.length:end;out+=sql.slice(i,stop);i=stop;continue;}
 if(sql.startsWith('/*',i)){const end=sql.indexOf('*/',i+2);assert.ok(end>=0);out+=sql.slice(i,end+2);i=end+2;continue;}
 if(sql[i]==="'"||sql[i]==='"'){const q=sql[i];let end=i+1;while(end<sql.length){if(sql[end]===q){if(sql[end+1]===q){end+=2;continue;}end++;break;}end++;}
  let token=sql.slice(i,end);if(token==='"medsense_app"')token='"public"';else if(/^'medsense_app\.[A-Za-z0-9_"]+'$/.test(token))token=token.replace("'medsense_app.","'public.");out+=token;i=end;continue;}
 if(sql[i]==='$'){const tag=sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/)?.[0];if(tag){const end=sql.indexOf(tag,i+tag.length);assert.ok(end>=0);assert.ok(!/\bmedsense_app\./.test(sql.slice(i+tag.length,end)),'Review schema-qualified function bodies before copying');out+=sql.slice(i,end+tag.length);i=end+tag.length;continue;}}
 const id=sql.slice(i).match(/^[a-zA-Z_][a-zA-Z_0-9]*/)?.[0];if(id){out+=id===sourceSchema?'public':id;i+=id.length;continue;}out+=sql[i++];
 }return out;}
async function manifest(client,schema){
 await client.query("SET TIME ZONE 'UTC'");
 const result={tables:{},sequences:{}};
 const names=(await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1 ORDER BY tablename',[schema])).rows;
 for(const {tablename} of names){const table=quote(schema)+'.'+quote(tablename);result.tables[tablename]=(await client.query(`SELECT count(*)::int count,md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) checksum FROM ${table} t`)).rows[0];}
 const sequences=(await client.query('SELECT sequencename FROM pg_sequences WHERE schemaname=$1 ORDER BY sequencename',[schema])).rows;
 for(const {sequencename} of sequences)result.sequences[sequencename]=(await client.query('SELECT last_value::text,is_called FROM '+quote(schema)+'.'+quote(sequencename))).rows[0];
 return result;
}
async function main(){const source=new Client(config(cloud)),target=new Client(config(local));try{
 assert.ok(cloud.DB_HOST.endsWith('.neon.tech'));assert.equal(cloud.DB_SCHEMA,sourceSchema);
 assert.ok(['localhost','127.0.0.1','::1'].includes(local.DB_HOST));assert.equal(local.DB_NAME,'medsenseai_pharm');
 await source.connect();await target.connect();
 if(process.argv[2]==='--prepare'){
  const dir=path.join(project,'database','cloud-migration-local-refresh-'+new Date().toISOString().replace(/[:.]/g,'-'));fs.mkdirSync(dir);
  console.log('Backing up the complete local database.');run('pg_dump',['--format=custom','--file',path.join(dir,'local-before.backup')],local);
  const old=await manifest(target,'public');
  await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const snapshot=(await source.query('SELECT pg_export_snapshot() snapshot')).rows[0].snapshot;
  const current=await manifest(source,sourceSchema);
  console.log('Exporting all live application tables from one consistent Neon snapshot.');
  run('pg_dump',['--schema='+sourceSchema,'--snapshot='+snapshot,'--format=custom','--no-owner','--no-privileges','--file',path.join(dir,'neon-app.backup')],cloud);
  await source.query('ROLLBACK');
  run('pg_restore',['--no-owner','--no-privileges','--file',path.join(dir,'neon-app.sql'),path.join(dir,'neon-app.backup')],local);
  const mapped=remap(fs.readFileSync(path.join(dir,'neon-app.sql'),'utf8'));
  const archive='public_before_neon_'+Date.now();
  fs.writeFileSync(path.join(dir,'local-updated.sql'),`SET lock_timeout='15s';\nALTER SCHEMA public RENAME TO ${quote(archive)};\n`+mapped);
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({archive,old,current,preparedAt:new Date().toISOString()},null,2));
  console.log(JSON.stringify({prepared:dir,oldTableCount:Object.keys(old.tables).length,newTableCount:Object.keys(current.tables).length,
   updatedCounts:Object.fromEntries(['brand','supplier_info','product','stock','customer','invoice','invoice_return'].map(t=>[t,current.tables[t]?.count])),archive}));
 }else if(process.argv[2]==='--apply'){
  const dir=path.resolve(process.argv[3]||'');assert.ok(dir.startsWith(path.join(project,'database')+path.sep));
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  assert.deepEqual(await manifest(target,'public'),saved.old,'Local data changed since backup; prepare again');
  console.log('Restoring current application tables into local public in one transaction; keeping previous public as an archive.');
  run('psql',['--no-psqlrc','--single-transaction','--set','ON_ERROR_STOP=1','--file',path.join(dir,'local-updated.sql')],local);
  const actual=await manifest(target,'public');assert.deepEqual(actual,saved.current,'Local copy does not match the Neon snapshot');
  assert.deepEqual(await manifest(target,saved.archive),saved.old,'Previous local tables were not preserved');
  fs.writeFileSync(path.join(dir,'verified.json'),JSON.stringify({verifiedAt:new Date().toISOString(),actual,archive:saved.archive},null,2));
  console.log(JSON.stringify({result:'PASS',database:local.DB_NAME,schema:'public',tables:Object.keys(actual.tables).length,
   verification:'Every table row checksum/count and sequence matches the Neon snapshot; previous local tables preserved',
   counts:Object.fromEntries(['brand','supplier_info','product','stock','customer','invoice','invoice_return'].map(t=>[t,actual.tables[t]?.count])),backup:dir}));
 }else throw Error('Use --prepare or --apply <prepared-directory>');
 }finally{await source.end();await target.end();}}
if(require.main===module)main().catch(e=>{console.error(e.message);if(e.stderr)console.error(String(e.stderr));process.exitCode=1});
module.exports={remap};
