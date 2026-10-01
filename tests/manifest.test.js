'use strict';

// Guards against `clasp create` / `clasp pull` silently replacing the manifest
// with the default one (which drops the web-app config and makes /exec unusable).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('appsscript.json keeps web-app config, scopes and Bangkok timezone', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'gas', 'appsscript.json'), 'utf8'));
  assert.equal(m.timeZone, 'Asia/Bangkok');
  assert.equal(m.runtimeVersion, 'V8');
  assert.deepEqual(m.webapp, { access: 'ANYONE_ANONYMOUS', executeAs: 'USER_DEPLOYING' });
  for (const s of ['spreadsheets', 'drive', 'documents']) {
    assert.ok(m.oauthScopes.includes('https://www.googleapis.com/auth/' + s), s);
  }
});
