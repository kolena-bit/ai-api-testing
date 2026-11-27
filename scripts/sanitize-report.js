#!/usr/bin/env node
// Removes secrets from Newman reports before they are published (the repo and its Pages site are public).
//
// Usage: node scripts/sanitize-report.js <token-file> <report> [<report> ...]
// Env:   BASE_URL, TEST_USER_EMAIL - values to hide.
//
// JSON reports: Authorization headers are removed and URL host arrays are replaced.
// All reports:  token, base URL, host and test-user email are replaced as plain text.
// Exits with code 1 if anything sensitive is still present afterwards.
'use strict';

const fs = require('fs');

const [tokenPath, ...reports] = process.argv.slice(2);
if (!tokenPath || reports.length === 0) {
  console.error('Usage: sanitize-report.js <token-file> <report> [<report> ...]');
  process.exit(2);
}

const token = fs.existsSync(tokenPath) ? fs.readFileSync(tokenPath, 'utf8').trim() : '';
const baseUrl = (process.env.BASE_URL || '').trim().replace(/\/$/, '');
const email = (process.env.TEST_USER_EMAIL || '').trim();
let host = '';
try { host = baseUrl ? new URL(baseUrl).hostname : ''; } catch (e) { /* not a URL */ }

function stripJson(node) {
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      const item = node[i];
      if (item && typeof item === 'object' && typeof item.key === 'string'
          && item.key.toLowerCase() === 'authorization') {
        node.splice(i, 1);
      } else {
        stripJson(item);
      }
    }
  } else if (node && typeof node === 'object') {
    // Newman stores URLs as objects with the host split into parts.
    if (host && Array.isArray(node.host) && node.host.join('.') === host) {
      node.host = ['[REDACTED_HOST]'];
    }
    for (const key of Object.keys(node)) stripJson(node[key]);
  }
}

const replaceAll = (text, value, label) => (value ? text.split(value).join(label) : text);

function scrub(text) {
  text = replaceAll(text, token, '[REDACTED_TOKEN]');
  text = replaceAll(text, baseUrl, '{{base_url}}');
  text = replaceAll(text, host, '[REDACTED_HOST]');
  text = replaceAll(text, email, '[REDACTED_EMAIL]');
  // HTML reports may contain the email HTML-escaped.
  text = replaceAll(text, email.replace('@', '&#64;'), '[REDACTED_EMAIL]');
  // Any leftover bearer token (for example from a request-level auth).
  text = text.replace(/Bearer\s+eyJ[\w-]+\.[\w-]+\.[\w-]+/g, 'Bearer [REDACTED_TOKEN]');
  return text;
}

let failed = false;
for (const file of reports) {
  if (!fs.existsSync(file)) {
    console.log(`skip (missing): ${file}`);
    continue;
  }
  let text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) {
    const report = JSON.parse(text);
    stripJson(report);
    text = JSON.stringify(report, null, 2);
  }
  text = scrub(text);
  fs.writeFileSync(file, text);

  const leaks = [];
  if (token && text.includes(token)) leaks.push('token');
  if (host && text.includes(host)) leaks.push('host');
  if (email && text.includes(email)) leaks.push('email');
  if (/eyJ[\w-]{10,}\.[\w-]{10,}\./.test(text)) leaks.push('JWT');
  if (leaks.length) {
    console.error(`LEAK in ${file}: ${leaks.join(', ')}`);
    failed = true;
  } else {
    console.log(`sanitized: ${file}`);
  }
}
process.exit(failed ? 1 : 0);
