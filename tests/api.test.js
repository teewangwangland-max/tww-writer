'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadGas, createMockEnv, GAS_DIR } = require('./helpers/gas-mock');

const GAS_FILES = [
  'Config.gs',
  'Db.gs',
  'Auth.gs',
  'Setup.gs',
  'Api.gs',
  'Users.gs',
  'Posts.gs',
  'Formats.gs',
  'Examples.gs',
  'StyleDna.gs',
  'Comps.gs',
  'Admin.gs',
  'SeedData.gs'
];

function loadFullGas(env) {
  return loadGas(GAS_FILES, {
    PropertiesService: env.PropertiesService,
    SpreadsheetApp: env.SpreadsheetApp,
    DriveApp: env.DriveApp,
    DocumentApp: env.DocumentApp,
    MimeType: env.MimeType,
    CacheService: env.CacheService,
    LockService: env.LockService,
    Utilities: env.Utilities,
    Logger: env.Logger,
    console: env.console,
    ContentService: env.ContentService
  });
}

function boot() {
  const env = createMockEnv();
  const ctx = loadFullGas(env);
  ctx.setup();
  return { env, ctx };
}

function call(ctx, action, payload) {
  const body = Object.assign({ action: action }, payload || {});
  const res = ctx.doPost({ postData: { contents: JSON.stringify(body) } });
  return JSON.parse(res.getContent());
}

function createUser(ctx, env, username, password, display, role) {
  const props = env.PropertiesService.getScriptProperties();
  props.setProperty('NEW_USER_USERNAME', username);
  props.setProperty('NEW_USER_PASSWORD', password);
  props.setProperty('NEW_USER_DISPLAY', display);
  props.setProperty('NEW_USER_ROLE', role);
  return ctx.adminCreateUser();
}

function login(ctx, username, password) {
  return call(ctx, 'auth.login', { username: username, password: password });
}

function sheetData(env, tab) {
  const ss = env.spreadsheets[env.props.SHEET_ID];
  return ss.getSheetByName(tab)._getData();
}

test('1. adminCreateUser: properties removed, pass_hash is 64-hex, no plain password anywhere in the sheet', () => {
  const { env, ctx } = boot();
  const password = 'test-pass-123';

  const userId = createUser(ctx, env, 'bank', password, 'Bank', 'admin');
  assert.ok(userId);

  const props = env.PropertiesService.getScriptProperties();
  assert.equal(props.getProperty('NEW_USER_USERNAME'), null);
  assert.equal(props.getProperty('NEW_USER_PASSWORD'), null);
  assert.equal(props.getProperty('NEW_USER_DISPLAY'), null);
  assert.equal(props.getProperty('NEW_USER_ROLE'), null);

  let foundHash = false;
  for (const tab of Object.keys(ctx.SCHEMA)) {
    const rows = sheetData(env, tab);
    for (const row of rows) {
      for (const cell of row) {
        assert.notEqual(cell, password, `password leaked in ${tab}`);
      }
    }
  }
  const users = sheetData(env, 'Users');
  const headers = users[0];
  const hashCol = headers.indexOf('pass_hash');
  for (let i = 1; i < users.length; i++) {
    if (users[i][headers.indexOf('user_id')] === userId) {
      assert.match(String(users[i][hashCol]), /^[0-9a-f]{64}$/);
      foundHash = true;
    }
  }
  assert.ok(foundHash);
});

test('2. login: token is 64-hex, session stores hash not token; lockout after repeated wrong password; same error for bad user/bad pass', () => {
  const { env, ctx } = boot();
  createUser(ctx, env, 'carol', 'test-pass-123', 'Carol', 'writer');

  const ok = login(ctx, 'carol', 'test-pass-123');
  assert.equal(ok.ok, true);
  assert.match(ok.data.token, /^[0-9a-f]{64}$/);

  const expectedHash = crypto.createHash('sha256').update(ok.data.token, 'utf8').digest('hex');
  const sessions = sheetData(env, 'Sessions');
  const headers = sessions[0];
  const hashCol = headers.indexOf('token_hash');
  const found = sessions.slice(1).some((r) => r[hashCol] === expectedHash);
  assert.ok(found, 'Sessions must store sha256(token), not the token');
  const rawTokenStored = sessions.slice(1).some((r) => r[hashCol] === ok.data.token);
  assert.ok(!rawTokenStored);

  const badUser = login(ctx, 'nobody', 'whatever');
  const badPass = login(ctx, 'carol', 'wrong-pass');
  assert.equal(badUser.error, 'BAD_CREDENTIALS');
  assert.equal(badPass.error, 'BAD_CREDENTIALS');
  assert.equal(badUser.error, badPass.error);

  // 5 wrong attempts total already includes the one above; do enough to trip the lock.
  let lastError = null;
  for (let i = 0; i < 6; i++) {
    const r = login(ctx, 'carol', 'still-wrong');
    lastError = r.error;
  }
  assert.equal(lastError, 'LOCKED');
});

test('3. auth.me: no token -> UNAUTHORIZED; expired session -> UNAUTHORIZED', () => {
  const { env, ctx } = boot();
  createUser(ctx, env, 'dave', 'test-pass-123', 'Dave', 'writer');
  const loginRes = login(ctx, 'dave', 'test-pass-123');
  const token = loginRes.data.token;

  const noToken = call(ctx, 'auth.me', {});
  assert.equal(noToken.ok, false);
  assert.equal(noToken.error, 'UNAUTHORIZED');

  const ok = call(ctx, 'auth.me', { token: token });
  assert.equal(ok.ok, true);

  const tokenHash = ctx.sha256Hex_(token);
  const session = ctx.findBy_('Sessions', 'token_hash', tokenHash);
  ctx.updateRow_('Sessions', session._row, { expires_at: new Date(Date.now() - 1000).toISOString() });

  const expired = call(ctx, 'auth.me', { token: token });
  assert.equal(expired.ok, false);
  assert.equal(expired.error, 'UNAUTHORIZED');
});

test('4. formats.save: FORBIDDEN for writer; admin appends versions 1,2; writer sees only published latest', () => {
  const { env, ctx } = boot();
  createUser(ctx, env, 'admin4', 'test-pass-123', 'Admin Four', 'admin');
  createUser(ctx, env, 'writer4', 'test-pass-123', 'Writer Four', 'writer');
  const adminToken = login(ctx, 'admin4', 'test-pass-123').data.token;
  const writerToken = login(ctx, 'writer4', 'test-pass-123').data.token;

  const forbidden = call(ctx, 'formats.save', {
    token: writerToken,
    spec: { id: 'fmt-alpha', name: 'Alpha' },
    status: 'published'
  });
  assert.equal(forbidden.error, 'FORBIDDEN');

  const v1 = call(ctx, 'formats.save', {
    token: adminToken,
    spec: { id: 'fmt-alpha', name: 'Alpha v1' },
    status: 'published'
  });
  assert.equal(v1.ok, true);
  assert.equal(v1.data.version, 1);

  const v2 = call(ctx, 'formats.save', {
    token: adminToken,
    spec: { id: 'fmt-alpha', name: 'Alpha v2' },
    status: 'published'
  });
  assert.equal(v2.ok, true);
  assert.equal(v2.data.version, 2);

  call(ctx, 'formats.save', {
    token: adminToken,
    spec: { id: 'fmt-draft', name: 'Draft Thing' },
    status: 'draft'
  });

  const writerList = call(ctx, 'formats.list', { token: writerToken });
  assert.equal(writerList.ok, true);
  const ids = writerList.data.map((f) => f.format_id);
  assert.ok(ids.includes('fmt-alpha'));
  assert.ok(!ids.includes('fmt-draft'), 'draft latest must be hidden from writer');
  const alpha = writerList.data.find((f) => f.format_id === 'fmt-alpha');
  assert.equal(alpha.version, 2);

  const adminList = call(ctx, 'formats.list', { token: adminToken });
  const adminIds = adminList.data.map((f) => f.format_id);
  assert.ok(adminIds.includes('fmt-draft'));
});

test('5. posts.save ownership + posts.list scope/q filters + no leaked body/inputs_json', () => {
  const { env, ctx } = boot();
  createUser(ctx, env, 'userA', 'test-pass-123', 'User A', 'writer');
  createUser(ctx, env, 'userB', 'test-pass-123', 'User B', 'writer');
  const tokenA = login(ctx, 'userA', 'test-pass-123').data.token;
  const tokenB = login(ctx, 'userB', 'test-pass-123').data.token;

  const saveRes = call(ctx, 'posts.save', {
    token: tokenA,
    post: {
      format_id: 'fmt-x',
      project_name: 'Alpha Tower',
      location: 'Bangna',
      inputs: { a: 1 },
      body: 'secret body text'
    }
  });
  assert.equal(saveRes.ok, true);
  const postId = saveRes.data.post.post_id;

  const stolen = call(ctx, 'posts.save', {
    token: tokenB,
    post: { post_id: postId, format_id: 'fmt-x', project_name: 'Hijack', body: 'x' }
  });
  assert.equal(stolen.error, 'FORBIDDEN');

  const mine = call(ctx, 'posts.list', { token: tokenA, scope: 'mine' });
  assert.ok(mine.data.some((p) => p.post_id === postId));

  const friendsA = call(ctx, 'posts.list', { token: tokenA, scope: 'friends' });
  assert.ok(!friendsA.data.some((p) => p.post_id === postId));

  const friendsB = call(ctx, 'posts.list', { token: tokenB, scope: 'friends' });
  assert.ok(friendsB.data.some((p) => p.post_id === postId));

  const filtered = call(ctx, 'posts.list', { token: tokenA, scope: 'all', q: 'alpha' });
  assert.ok(filtered.data.some((p) => p.post_id === postId));
  const noMatch = call(ctx, 'posts.list', { token: tokenA, scope: 'all', q: 'zzz-no-match' });
  assert.ok(!noMatch.data.some((p) => p.post_id === postId));

  for (const row of mine.data) {
    assert.equal(row.body, undefined);
    assert.equal(row.inputs_json, undefined);
    assert.equal(row.results_json, undefined);
    assert.equal(row.narrative_json, undefined);
    assert.equal(row.tone_json, undefined);
  }
});

test('6. posts.save createDoc creates a new Doc each time (never overwrites); saveAsExample is idempotent', () => {
  const { env, ctx } = boot();
  createUser(ctx, env, 'userC', 'test-pass-123', 'User C', 'writer');
  const token = login(ctx, 'userC', 'test-pass-123').data.token;

  const saved = call(ctx, 'posts.save', {
    token: token,
    post: { format_id: 'fmt-x', project_name: 'Doc Project', body: 'hello world' }
  });
  const postId = saved.data.post.post_id;

  const docsFolderId = env.props.DOCS_FOLDER_ID;

  const withDoc1 = call(ctx, 'posts.save', {
    token: token,
    post: { post_id: postId, format_id: 'fmt-x', project_name: 'Doc Project', body: 'hello world' },
    createDoc: true
  });
  assert.equal(withDoc1.ok, true);
  const url1 = withDoc1.data.post.doc_url;
  assert.match(url1, /^https:\/\/docs\.google\.com\/document\/d\//);

  const createCallsAfter1 = env.calls.filter((c) => c.op === 'DocumentApp.create').length;
  assert.equal(createCallsAfter1, 1);
  const moveCall = env.calls.find((c) => c.op === 'DriveApp.getFileById.moveTo');
  assert.ok(moveCall);
  assert.equal(moveCall.folder, docsFolderId);

  const withDoc2 = call(ctx, 'posts.save', {
    token: token,
    post: { post_id: postId, format_id: 'fmt-x', project_name: 'Doc Project', body: 'hello world v2' },
    createDoc: true
  });
  const url2 = withDoc2.data.post.doc_url;
  assert.notEqual(url1, url2, 'a second createDoc must create a NEW doc, never overwrite');
  const createCallsAfter2 = env.calls.filter((c) => c.op === 'DocumentApp.create').length;
  assert.equal(createCallsAfter2, 2);

  call(ctx, 'posts.save', {
    token: token,
    post: { post_id: postId, format_id: 'fmt-x', project_name: 'Doc Project', body: 'v3' },
    saveAsExample: true
  });
  call(ctx, 'posts.save', {
    token: token,
    post: { post_id: postId, format_id: 'fmt-x', project_name: 'Doc Project', body: 'v4' },
    saveAsExample: true
  });

  const examples = sheetData(env, 'Examples');
  const headers = examples[0];
  const sourceRefCol = headers.indexOf('source_ref');
  const matching = examples.slice(1).filter((r) => r[sourceRefCol] === postId);
  assert.equal(matching.length, 1, 'saveAsExample twice must yield exactly one Examples row');
});

test('7. styledna: versioning, rollback, HOUSE write requires admin, reading others scope forbidden', () => {
  const { env, ctx } = boot();
  createUser(ctx, env, 'userD', 'test-pass-123', 'User D', 'writer');
  createUser(ctx, env, 'userE', 'test-pass-123', 'User E', 'writer');
  const tokenD = login(ctx, 'userD', 'test-pass-123').data.token;
  const tokenE = login(ctx, 'userE', 'test-pass-123').data.token;
  const userD = ctx.findBy_('Users', 'username', 'userd');

  const v1 = call(ctx, 'styledna.save', {
    token: tokenD,
    scope: userD.user_id,
    dna: { tone: 'fun' },
    changelog: 'init'
  });
  assert.equal(v1.ok, true);
  assert.equal(v1.data.version, 1);

  const v2 = call(ctx, 'styledna.save', {
    token: tokenD,
    scope: userD.user_id,
    dna: { tone: 'fun2' },
    changelog: 'update'
  });
  assert.equal(v2.data.version, 2);

  const rollback = call(ctx, 'styledna.rollback', { token: tokenD, scope: userD.user_id, to_version: 1 });
  assert.equal(rollback.ok, true);
  assert.equal(rollback.data.version, 3);
  assert.deepEqual(rollback.data.dna, { tone: 'fun' });

  const houseAttempt = call(ctx, 'styledna.save', {
    token: tokenD,
    scope: 'HOUSE',
    dna: { tone: 'house' },
    changelog: 'nope'
  });
  assert.equal(houseAttempt.error, 'FORBIDDEN');

  const readOther = call(ctx, 'styledna.get', { token: tokenE, scope: userD.user_id });
  assert.equal(readOther.error, 'FORBIDDEN');
});

test('8. examples.importDoc: extracts id from URL, stores text; re-import is a duplicate (no new row)', () => {
  const { env, ctx } = boot();
  createUser(ctx, env, 'userF', 'test-pass-123', 'User F', 'writer');
  const token = login(ctx, 'userF', 'test-pass-123').data.token;

  const docId = 'AbCdEfGhIj1234567890abcd';
  env.DocumentApp._registerDoc(docId, 'My Great Post', 'imported example text');
  const url = 'https://docs.google.com/document/d/' + docId + '/edit';

  const first = call(ctx, 'examples.importDoc', { token: token, doc: url, format_id: 'fmt-x' });
  assert.equal(first.ok, true);
  assert.equal(first.data.duplicate, false);
  assert.equal(first.data.example.body, 'imported example text');

  const countAfterFirst = sheetData(env, 'Examples').length - 1;

  const second = call(ctx, 'examples.importDoc', { token: token, doc: url, format_id: 'fmt-x' });
  assert.equal(second.ok, true);
  assert.equal(second.data.duplicate, true);

  const countAfterSecond = sheetData(env, 'Examples').length - 1;
  assert.equal(countAfterSecond, countAfterFirst);
});

test('9. adminSeedFormats run twice yields exactly one Formats row for feasibility-3case', () => {
  const { env, ctx } = boot();
  ctx.adminSeedFormats();
  ctx.adminSeedFormats();

  const formats = sheetData(env, 'Formats');
  const headers = formats[0];
  const idCol = headers.indexOf('format_id');
  const matching = formats.slice(1).filter((r) => r[idCol] === 'feasibility-3case');
  assert.equal(matching.length, 1);
});

test('10. static scan: gas/*.gs has no forbidden calls; deleteSheet only in Setup.gs', () => {
  const forbidden = [
    'UrlFetchApp',
    'eval(',
    'new Function',
    'deleteRow',
    '.clear(',
    'clearContents',
    'setTrashed',
    'removeFile'
  ];
  const files = fs.readdirSync(GAS_DIR).filter((f) => f.endsWith('.gs'));
  assert.ok(files.length > 0);

  for (const file of files) {
    const src = fs.readFileSync(path.join(GAS_DIR, file), 'utf8');
    for (const needle of forbidden) {
      assert.ok(!src.includes(needle), `${file} must not contain "${needle}"`);
    }
    if (file !== 'Setup.gs') {
      assert.ok(!src.includes('deleteSheet'), `${file} must not call deleteSheet`);
    }
  }
});

test('11. router: unknown action, oversized body, and a non-ApiError throw', () => {
  const { env, ctx } = boot();

  const unknown = call(ctx, 'totally.unknown', {});
  assert.equal(unknown.error, 'UNKNOWN_ACTION');

  const bigBody = JSON.stringify({ action: 'ping', filler: 'x'.repeat(210000) });
  const tooLarge = JSON.parse(ctx.doPost({ postData: { contents: bigBody } }).getContent());
  assert.equal(tooLarge.error, 'TOO_LARGE');

  ctx.ROUTES['test.boom'] = {
    auth: 'none',
    fn: function () {
      throw new Error('kaboom');
    }
  };
  const boom = call(ctx, 'test.boom', {});
  assert.equal(boom.ok, false);
  assert.equal(boom.error, 'SERVER_ERROR');
});
