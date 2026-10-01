/**
 * Db.gs — thin sheet-backed data access helpers on top of SCHEMA (Config.gs).
 * No function here may delete rows, clear ranges, trash files or delete sheets.
 */

var _dbCache_ = null;

function db_() {
  if (!_dbCache_) {
    var id = PropertiesService.getScriptProperties().getProperty(PROP_SHEET_ID);
    _dbCache_ = SpreadsheetApp.openById(id);
  }
  return _dbCache_;
}

function sheet_(tab) {
  var sheet = db_().getSheetByName(tab);
  if (!sheet) throw new ApiError('SERVER_ERROR', 'Missing sheet: ' + tab);
  return sheet;
}

/**
 * Reads every data row of `tab` into an array of plain objects keyed by
 * SCHEMA[tab]. Row 1 (headers) is skipped. Fully empty rows are skipped.
 * Each object also gets a hidden `_row` (1-based sheet row number) that
 * callers MUST strip before returning data to the client.
 */
function readAll_(tab) {
  var headers = SCHEMA[tab];
  var sheet = sheet_(tab);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var isEmpty = true;
    for (var c = 0; c < row.length; c++) {
      if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
        isEmpty = false;
        break;
      }
    }
    if (isEmpty) continue;
    var obj = {};
    for (var h = 0; h < headers.length; h++) {
      obj[headers[h]] = normalizeCell_(row[h]);
    }
    obj._row = 2 + i;
    out.push(obj);
  }
  return out;
}

/**
 * Real Sheets auto-converts ISO date strings to Date objects; turn them back into
 * ISO strings so comparisons and sorting behave the same as in tests.
 */
function normalizeCell_(v) {
  if (v === undefined || v === null) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return v.toISOString();
  return v;
}

/** Strips the hidden _row property before sending an object to the client. */
function stripRow_(obj) {
  if (!obj) return obj;
  var copy = {};
  for (var k in obj) {
    if (k === '_row') continue;
    copy[k] = obj[k];
  }
  return copy;
}

/** Builds a row in SCHEMA order (missing -> ''), appends it. Returns obj. */
function append_(tab, obj) {
  var headers = SCHEMA[tab];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var v = obj[headers[i]];
    row.push(v === undefined || v === null ? '' : v);
  }
  sheet_(tab).appendRow(row);
  return obj;
}

/**
 * Writes only the patched columns of row `rowNumber` (1-based sheet row).
 * Never touches other rows.
 */
function updateRow_(tab, rowNumber, patch) {
  var headers = SCHEMA[tab];
  var sheet = sheet_(tab);
  for (var key in patch) {
    var col = headers.indexOf(key);
    if (col === -1) continue;
    var v = patch[key];
    sheet.getRange(rowNumber, col + 1).setValue(v === undefined || v === null ? '' : v);
  }
}

/** First object (with _row) whose `key` field === value, or null. */
function findBy_(tab, key, value) {
  var rows = readAll_(tab);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][key]) === String(value)) return rows[i];
  }
  return null;
}

function newId_(prefix) {
  return prefix + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function nowIso_() {
  return new Date().toISOString();
}

function parseJson_(s, fallback) {
  if (s === '' || s === null || s === undefined) return fallback;
  try {
    return JSON.parse(s);
  } catch (e) {
    return fallback;
  }
}

/**
 * Runs `fn` while holding the script lock (10s wait), always releasing it.
 * Callers wrap all writes with this to serialize appends/updates.
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
