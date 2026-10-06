const fs=require('node:fs'),path=require('node:path');
const env=require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../.env')));
if(!env.DB_HOST?.endsWith('.neon.tech')||env.DB_SCHEMA!=='medsense_app')throw Error('Expected application Neon configuration');
const file=path.resolve(__dirname,'../data/pgadmin-neon-live.json');
const server={Name:'MedSenseAI LIVE - Neon (medsense_app)',Group:'MedSenseAI Live',Host:env.DB_HOST,Port:Number(env.DB_PORT||5432),
 MaintenanceDB:env.DB_NAME,Username:env.DB_USER,DBRestriction:env.DB_NAME,
 ConnectionParameters:{sslmode:'require',connect_timeout:20},
 PasswordExecCommand:`"${process.execPath}" "${path.resolve(__dirname,'pgadmin-neon-password.cjs')}"`,PasswordExecExpiration:300,
 PostConnectionSQL:'SET search_path TO medsense_app, public;',
 Comment:'Live application database. Open neondb > Schemas > medsense_app > Tables. The local PostgreSQL 18 server and Neon public schema contain separate older data.'};
fs.writeFileSync(file,JSON.stringify({Servers:{'1':server}},null,2));console.log('Prepared pgAdmin live-server definition (no password stored): '+file);
