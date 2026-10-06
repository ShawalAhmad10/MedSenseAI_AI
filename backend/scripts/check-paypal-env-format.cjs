const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const source = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const parsed = dotenv.parse(source);
const keys = ['PAYPAL_MODE','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_DAILY_PLAN_ID',
  'PAYPAL_WEEKLY_PLAN_ID','PAYPAL_MONTHLY_PLAN_ID','PAYPAL_BASE_URL','PAYPAL_PUBLIC_URL','PAYPAL_WEBHOOK_ID'];
console.log(JSON.stringify({ configurationFile: 'backend/.env', mode: ['sandbox','live'].includes(parsed.PAYPAL_MODE?.trim().toLowerCase()) ? parsed.PAYPAL_MODE.trim().toLowerCase() : 'invalid',
  credentialsIdentical: parsed.PAYPAL_CLIENT_ID === parsed.PAYPAL_CLIENT_SECRET,
  fields: keys.map(key => {
    const value = parsed[key] || '';
    return { key, present: Boolean(value.trim()), duplicateEntries: source.split(/\r?\n/).filter(line => new RegExp('^\\s*' + key + '\\s*=').test(line)).length > 1,
      surroundingWhitespace: value !== value.trim(),
      likelyPlaceholder: /your[_ -]|replace[_ -]|example|xxxx|paste[_ -]|here|\.\.\.|…/i.test(value),
      nonAscii: /[^\x20-\x7e]/.test(value),
      credentialsShapeValid: key === 'PAYPAL_CLIENT_ID' || key === 'PAYPAL_CLIENT_SECRET' ? /^[A-Za-z0-9_-]{60,}$/.test(value.trim()) : undefined };
  }) }, null, 2));
