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


function setup2() {
  const { env, ctx } = boot();
  createUser(ctx, env, 'adminX', 'test-pass-123', 'Admin X', 'admin');
  createUser(ctx, env, 'writerA', 'test-pass-123', 'Writer A', 'writer');
  createUser(ctx, env, 'writerB', 'test-pass-123', 'Writer B', 'writer');
  const ta = login(ctx, 'adminX', 'test-pass-123').data.token;
  const tw = login(ctx, 'writerA', 'test-pass-123').data.token;
  const tb = login(ctx, 'writerB', 'test-pass-123').data.token;
  const writerA = ctx.findBy_('Users', 'username', 'writera');
  return { env, ctx, ta, tw, tb, writerA };
}

test('examples.update: owner hides own example; include_hidden shows it with active false', () => {
  const { ctx, tw, tb } = setup2();
  const ex = call(ctx, 'examples.add', { token: tw, format_id: 'fmt-x', title: 'T1', body: 'B1' }).data;
  const hide = call(ctx, 'examples.update', { token: tw, example_id: ex.example_id, active: false });
  assert.equal(hide.ok, true);
  assert.equal(hide.data.active, false);
  assert.equal(hide.data._row, undefined);

  const plain = call(ctx, 'examples.list', { token: tw, owner: ex.owner }).data;
  assert.equal(plain.some((e) => e.example_id === ex.example_id), false);
  const withHidden = call(ctx, 'examples.list', { token: tw, owner: ex.owner, include_hidden: true }).data;
  const found = withHidden.find((e) => e.example_id === ex.example_id);
  assert.ok(found);
  assert.equal(found.active, false);

  // another writer never sees hidden rows of someone else, even with include_hidden
  const other = call(ctx, 'examples.list', { token: tb, owner: ex.owner, include_hidden: true }).data;
  assert.equal(other.some((e) => e.example_id === ex.example_id), false);

  const show = call(ctx, 'examples.update', { token: tw, example_id: ex.example_id, active: true });
  assert.equal(show.data.active, true);
  const again = call(ctx, 'examples.list', { token: tw, owner: ex.owner }).data;
  assert.equal(again.find((e) => e.example_id === ex.example_id).active, true);
});

test('examples.update: other writer FORBIDDEN, unknown id NOT_FOUND, bad input', () => {
  const { ctx, tw, tb } = setup2();
  const ex = call(ctx, 'examples.add', { token: tw, format_id: 'fmt-x', title: 'T1', body: 'B1' }).data;
  assert.equal(call(ctx, 'examples.update', { token: tb, example_id: ex.example_id, active: false }).error, 'FORBIDDEN');
  assert.equal(call(ctx, 'examples.update', { token: tw, example_id: 'ex-nope', active: false }).error, 'NOT_FOUND');
  assert.equal(call(ctx, 'examples.update', { token: tw, example_id: ex.example_id, title: '' }).error, 'BAD_INPUT');
  assert.equal(call(ctx, 'examples.update', { token: tw, example_id: ex.example_id, active: 'no' }).error, 'BAD_INPUT');
  assert.equal(call(ctx, 'examples.update', { token: tw, example_id: ex.example_id, format_id: 'x'.repeat(101) }).error, 'BAD_INPUT');
});

test('examples.update: admin can update HOUSE and others rows; format change persists; other columns untouched', () => {
  const { ctx, ta, tw } = setup2();
  const mine = call(ctx, 'examples.add', { token: tw, format_id: 'fmt-x', title: 'Mine', body: 'Body mine' }).data;
  const house = call(ctx, 'examples.add', { token: ta, owner: 'HOUSE', format_id: 'fmt-x', title: 'H', body: 'HB' }).data;

  const r1 = call(ctx, 'examples.update', { token: ta, example_id: mine.example_id, format_id: 'fmt-y' });
  assert.equal(r1.ok, true);
  assert.equal(r1.data.format_id, 'fmt-y');
  assert.equal(r1.data.title, 'Mine');
  assert.equal(r1.data.body, 'Body mine');
  const r2 = call(ctx, 'examples.update', { token: ta, example_id: house.example_id, active: false });
  assert.equal(r2.ok, true);

  const list = call(ctx, 'examples.list', { token: tw, owner: mine.owner, format_id: 'fmt-y' }).data;
  assert.equal(list.length, 1);

  const cleared = call(ctx, 'examples.update', { token: tw, example_id: mine.example_id, format_id: '' });
  assert.equal(cleared.data.format_id, '');

  const writerOnHouse = call(ctx, 'examples.update', { token: tw, example_id: house.example_id, active: true });
  assert.equal(writerOnHouse.error, 'FORBIDDEN');
});

test('examples.add: promote flow stores source promoted + source_ref; default stays manual; writer cannot promote', () => {
  const { ctx, ta, tw } = setup2();
  const mine = call(ctx, 'examples.add', { token: tw, format_id: 'fmt-x', title: 'Mine', body: 'Body' }).data;
  assert.equal(mine.source, 'manual');
  assert.equal(mine.source_ref, '');

  const before = call(ctx, 'examples.list', { token: ta, owner: 'HOUSE', format_id: 'fmt-x' }).data;
  assert.equal(before.some((e) => e.source_ref === mine.example_id), false);

  const promoted = call(ctx, 'examples.add', {
    token: ta, owner: 'HOUSE', format_id: 'fmt-x', title: mine.title, body: mine.body,
    source: 'promoted', source_ref: mine.example_id
  });
  assert.equal(promoted.ok, true);
  assert.equal(promoted.data.source, 'promoted');
  assert.equal(promoted.data.source_ref, mine.example_id);

  const after = call(ctx, 'examples.list', { token: ta, owner: 'HOUSE', format_id: 'fmt-x' }).data;
  assert.equal(after.filter((e) => e.source_ref === mine.example_id).length, 1);

  const denied = call(ctx, 'examples.add', { token: tw, owner: 'HOUSE', format_id: 'fmt-x', title: 'a', body: 'b', source: 'promoted' });
  assert.equal(denied.error, 'FORBIDDEN');
});

// Folder import must survive an unreadable doc and must not resurrect hidden examples on re-run.
test('folder import: unreadable doc is reported, hidden imports stay hidden on re-run', () => {
  const { env, ctx } = boot();
  createUser(ctx, env, 'adminF', 'test-pass-123', 'Admin F', 'admin');
  const token = login(ctx, 'adminF', 'test-pass-123').data.token;
  const me = call(ctx, 'auth.me', { token }).data.user;
  const folder = env.DriveApp.createFolder('Old posts').getId();
  env.DocumentApp._registerDoc('docA', 'Doc A', 'body A', folder);
  // exists in Drive but DocumentApp cannot open it (e.g. owned by another account, not shared)
  env.DriveApp._registerFile('docB', 'Doc B', 'GOOGLE_DOCS', folder);
  const r1 = call(ctx, 'examples.importFolder', { token, folder_id: folder, format_id: 'f', owner_user_id: me.user_id });
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.equal(r1.data.imported, 1);
  assert.deepEqual(Array.from(r1.data.failed), ['Doc B']);
  const ex = call(ctx, 'examples.list', { token, owner: me.user_id }).data[0];
  call(ctx, 'examples.update', { token, example_id: ex.example_id, active: false });
  const r2 = call(ctx, 'examples.importFolder', { token, folder_id: folder, format_id: 'f', owner_user_id: me.user_id });
  assert.equal(r2.data.imported, 0);
  assert.equal(r2.data.skipped, 1);
  assert.equal(call(ctx, 'examples.list', { token, owner: me.user_id }).data.length, 0, 'hidden example not re-imported');
});
