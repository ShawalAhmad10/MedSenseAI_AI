// pgAdmin desktop password provider. Invoke only from pgAdmin, not a terminal.
// Credentials stay in the existing backend .env, not in the server import file.
const fs=require('node:fs'),path=require('node:path');
const env=require('dotenv').parse(fs.readFileSync(path.resolve(__dirname,'../.env')));
if(!env.DB_HOST?.endsWith('.neon.tech')||env.DB_SCHEMA!=='medsense_app'||!env.DB_PASSWORD)process.exit(1);
process.stdout.write(env.DB_PASSWORD);
