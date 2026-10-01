'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadGas, createMockEnv, GAS_DIR } = require('./helpers/gas-mock');

const TAB_NAMES = ['Users', 'Sessions', 'Posts', 'Examples', 'StyleDNA', 'Formats', 'Comps'];

// Objects/arrays that cross the vm boundary belong to a different realm, so
// their Array/Object are not === the main realm's. Rebuild them as plain
// main-realm values (via JSON) before using assert.deepEqual on them.
function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSetupCtx(env) {
  return loadGas(['Config.gs', 'Setup.gs'], {
    PropertiesService: env.PropertiesService,
    SpreadsheetApp: env.SpreadsheetApp,
    DriveApp: env.DriveApp,
    Logger: env.Logger
  });
}

// Api.gs (since P2) routes to Auth/Users/Posts/Formats/Examples/StyleDna/Comps/
// Admin, so the router needs the full bundle + full mock set to load at all.
function loadApiCtx(env) {
  return loadGas(
    [
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
    ],
    {
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
    }
  );
}

test('1. first run on empty props creates all 7 tabs, deletes empty Sheet1, stores both properties', () => {
  const env = createMockEnv();
  const ctx = loadSetupCtx(env);

  const report = ctx.setup();

  assert.deepEqual(toPlain(report.created).sort(), [...TAB_NAMES].sort());
  assert.deepEqual(toPlain(report.ok), []);
  assert.deepEqual(toPlain(report.warnings), []);

  const ss = env.spreadsheets[report.sheetId];
  assert.ok(ss, 'spreadsheet should exist');
  assert.equal(ss.getSheetByName('Sheet1'), null, 'empty default Sheet1 should be deleted');

  for (const tab of TAB_NAMES) {
    const sheet = ss.getSheetByName(tab);
    assert.ok(sheet, `${tab} sheet should exist`);
    const headers = sheet.getRange(1, 1, 1, ctx.SCHEMA[tab].length).getValues()[0];
    assert.deepEqual(toPlain(headers), toPlain(ctx.SCHEMA[tab]));
  }

  assert.equal(env.props.SHEET_ID, report.sheetId);
  assert.equal(env.props.DOCS_FOLDER_ID, report.docsFolderId);
});

test('2. second run is a no-op: created empty, ok has all 7, no create/insert/delete calls', () => {
  const env = createMockEnv();
  const ctx1 = loadSetupCtx(env);
  ctx1.setup();

  env.calls.length = 0; // reset call log, keep state (props/spreadsheets/folders)

  const ctx2 = loadSetupCtx(env);
  const report = ctx2.setup();

  assert.deepEqual(toPlain(report.created), []);
  assert.deepEqual(toPlain(report.ok).sort(), [...TAB_NAMES].sort());
  assert.deepEqual(toPlain(report.warnings), []);

  const forbiddenOps = ['insertSheet', 'deleteSheet', 'DriveApp.createFolder', 'SpreadsheetApp.create'];
  for (const call of env.calls) {
    assert.ok(!forbiddenOps.includes(call.op), `unexpected call: ${call.op}`);
  }
});

test('3. existing spreadsheet with a mismatched, non-empty Posts tab: nothing written, warning mentions Posts', () => {
  const env = createMockEnv();
  const ss = env.makeSpreadsheet('preset_sheet_1');

  // Load Config.gs alone just to read SCHEMA for building fixture data.
  const configCtx = loadGas(['Config.gs'], {});

  for (const tab of TAB_NAMES) {
    const sheet = env.makeSheet(tab);
    if (tab === 'Posts') {
      sheet._setData([
        ['id', 'owner', 'wrong_header'],
        ['p1', 'u1', 'oops']
      ]);
    } else {
      sheet._setData([configCtx.SCHEMA[tab].slice()]);
    }
    ss._addSheetRaw(sheet);
  }
  env.SpreadsheetApp._register(ss);
  env.props.SHEET_ID = ss.getId();
  env.props.DOCS_FOLDER_ID = 'preset_folder_1';
  env.folders.preset_folder_1 = { getId: () => 'preset_folder_1', getName: () => 'x' };

  const ctx = loadSetupCtx(env);
  const report = ctx.setup();

  assert.deepEqual(toPlain(report.created), []);
  assert.ok(report.ok.includes('Users'));
  assert.ok(!report.ok.includes('Posts'));
  assert.ok(report.warnings.some((w) => w.includes('Posts')));

  const postsSetValuesCalls = env.calls.filter((c) => c.op === 'setValues' && c.sheet === 'Posts');
  assert.deepEqual(postsSetValuesCalls, []);
});

test('4. existing empty Sheet1 not created this run is never deleted', () => {
  const env = createMockEnv();
  const ss = env.makeSpreadsheet('preset_sheet_2');
  const configCtx = loadGas(['Config.gs'], {});

  for (const tab of TAB_NAMES) {
    const sheet = env.makeSheet(tab);
    sheet._setData([configCtx.SCHEMA[tab].slice()]);
    ss._addSheetRaw(sheet);
  }
  ss._addSheetRaw(env.makeSheet('Sheet1')); // empty, pre-existing
  env.SpreadsheetApp._register(ss);
  env.props.SHEET_ID = ss.getId();

  const ctx = loadSetupCtx(env);
  ctx.setup();

  assert.ok(ss.getSheetByName('Sheet1'), 'pre-existing empty Sheet1 must NOT be deleted');
  assert.ok(!env.calls.some((c) => c.op === 'deleteSheet'));
});

test('5. doGet/doPost basic routing', () => {
  const env = createMockEnv();
  const ctx = loadApiCtx(env);

  const getResult = JSON.parse(ctx.doGet({}).getContent());
  assert.equal(getResult.ok, true);
  assert.equal(getResult.version, '0.2.0');

  const pingResult = JSON.parse(ctx.doPost({ postData: { contents: '{"action":"ping"}' } }).getContent());
  assert.equal(pingResult.ok, true);
  assert.equal(pingResult.data.pong, true);

  const badJsonResult = JSON.parse(ctx.doPost({ postData: { contents: 'not json' } }).getContent());
  assert.equal(badJsonResult.ok, false);
  assert.equal(badJsonResult.error, 'BAD_JSON');
});

test('6. static scan: no destructive/eval-like calls in gas/*.gs', () => {
  const forbidden = ['eval(', 'new Function', '.clear(', 'clearContents', 'deleteRow', 'setTrashed'];
  const files = fs.readdirSync(GAS_DIR).filter((f) => f.endsWith('.gs'));
  assert.ok(files.length > 0);

  for (const file of files) {
    const src = fs.readFileSync(path.join(GAS_DIR, file), 'utf8');
    for (const needle of forbidden) {
      assert.ok(!src.includes(needle), `${file} must not contain "${needle}"`);
    }
  }
});
