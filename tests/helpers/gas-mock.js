'use strict';

const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const GAS_DIR = path.join(__dirname, '..', '..', 'gas');

/**
 * Reads the listed gas/*.gs files, concatenates them, and runs them in a
 * node:vm context whose globals are the provided mocks. Returns the context
 * so tests can call functions (setup, doGet, doPost, ...) and read globals
 * (SCHEMA, APP_NAME, ...) defined by the loaded source.
 */
function loadGas(files, mocks) {
  const source = files
    .map((f) => fs.readFileSync(path.join(GAS_DIR, f), 'utf8'))
    .join('\n;\n');

  const context = Object.assign({}, mocks);
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'gas-bundle.js' });
  return context;
}

/**
 * Builds a fresh in-memory mock of the Apps Script services used by Setup.gs
 * and Api.gs. Every mutating call is recorded in `calls` so tests can assert
 * on it. A newly created spreadsheet starts with one empty sheet "Sheet1".
 */
function createMockEnv() {
  const calls = [];
  const props = {};
  const spreadsheets = {};
  const folders = {};
  let sheetCounter = 0;
  let folderCounter = 0;

  function makeSheet(name) {
    let data = [];
    let frozenRows = 0;

    return {
      getName() {
        return name;
      },
      getLastRow() {
        return data.length;
      },
      getLastColumn() {
        let max = 0;
        for (const row of data) max = Math.max(max, row.length);
        return max;
      },
      getRange(r, c, nr, nc) {
        nr = nr === undefined ? 1 : nr;
        nc = nc === undefined ? 1 : nc;
        return {
          getValues() {
            const out = [];
            for (let i = 0; i < nr; i++) {
              const row = data[r - 1 + i] || [];
              const outRow = [];
              for (let j = 0; j < nc; j++) {
                const v = row[c - 1 + j];
                outRow.push(v === undefined ? '' : v);
              }
              out.push(outRow);
            }
            return out;
          },
          getValue() {
            const row = data[r - 1] || [];
            const v = row[c - 1];
            return v === undefined ? '' : v;
          },
          setValues(values) {
            calls.push({ op: 'setValues', sheet: name });
            for (let i = 0; i < values.length; i++) {
              const rowIdx = r - 1 + i;
              if (!data[rowIdx]) data[rowIdx] = [];
              for (let j = 0; j < values[i].length; j++) {
                data[rowIdx][c - 1 + j] = values[i][j];
              }
            }
          },
          setValue(value) {
            calls.push({ op: 'setValue', sheet: name, row: r, col: c });
            if (!data[r - 1]) data[r - 1] = [];
            data[r - 1][c - 1] = value;
          }
        };
      },
      appendRow(row) {
        calls.push({ op: 'appendRow', sheet: name });
        data.push(row.slice());
      },
      getDataRange() {
        const nr = data.length;
        let nc = 0;
        for (const row of data) nc = Math.max(nc, row.length);
        return this.getRange(1, 1, Math.max(nr, 1), Math.max(nc, 1));
      },
      setFrozenRows(n) {
        frozenRows = n;
        calls.push({ op: 'setFrozenRows', sheet: name, n });
      },
      getFrozenRows() {
        return frozenRows;
      },
      _setData(rows) {
        data = rows;
      },
      _getData() {
        return data;
      }
    };
  }

  function makeSpreadsheet(id) {
    const sheets = [];
    const url = 'https://docs.google.com/spreadsheets/d/' + id;

    return {
      getId() {
        return id;
      },
      getUrl() {
        return url;
      },
      getSheetByName(n) {
        return sheets.find((s) => s.getName() === n) || null;
      },
      getSheets() {
        return sheets.slice();
      },
      insertSheet(n) {
        calls.push({ op: 'insertSheet', name: n });
        const s = makeSheet(n);
        sheets.push(s);
        return s;
      },
      deleteSheet(s) {
        calls.push({ op: 'deleteSheet', name: s.getName() });
        const idx = sheets.indexOf(s);
        if (idx >= 0) sheets.splice(idx, 1);
      },
      _addSheetRaw(s) {
        sheets.push(s);
      }
    };
  }

  const PropertiesService = {
    getScriptProperties() {
      return {
        getProperty(key) {
          return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null;
        },
        setProperty(key, value) {
          calls.push({ op: 'setProperty', key, value });
          props[key] = value;
        },
        deleteProperty(key) {
          calls.push({ op: 'deleteProperty', key });
          delete props[key];
        }
      };
    }
  };

  const SpreadsheetApp = {
    create(name) {
      calls.push({ op: 'SpreadsheetApp.create', name });
      sheetCounter++;
      const id = 'sheet_' + sheetCounter;
      const ss = makeSpreadsheet(id);
      ss._addSheetRaw(makeSheet('Sheet1'));
      spreadsheets[id] = ss;
      return ss;
    },
    openById(id) {
      if (!spreadsheets[id]) throw new Error('No spreadsheet: ' + id);
      return spreadsheets[id];
    },
    _register(ss) {
      spreadsheets[ss.getId()] = ss;
    }
  };

  // driveFiles: id -> { id, name, mimeType, folderId }
  const driveFiles = {};
  const docs = {}; // id -> { id, name, text }
  let docCounter = 0;

  function makeFolder(id, name) {
    const fileIds = [];
    return {
      getId() {
        return id;
      },
      getName() {
        return name;
      },
      _fileIds: fileIds,
      getFilesByType(mime) {
        const list = fileIds
          .filter((fid) => driveFiles[fid] && driveFiles[fid].mimeType === mime)
          .map((fid) => driveFiles[fid]);
        let idx = 0;
        return {
          hasNext() {
            return idx < list.length;
          },
          next() {
            const f = list[idx++];
            return {
              getId() {
                return f.id;
              },
              getName() {
                return f.name;
              }
            };
          }
        };
      }
    };
  }

  const DriveApp = {
    createFolder(name) {
      calls.push({ op: 'DriveApp.createFolder', name });
      folderCounter++;
      const id = 'folder_' + folderCounter;
      const folder = makeFolder(id, name);
      folders[id] = folder;
      return folder;
    },
    getFolderById(id) {
      if (!folders[id]) throw new Error('No folder: ' + id);
      return folders[id];
    },
    getFileById(id) {
      if (!driveFiles[id]) throw new Error('No file: ' + id);
      return {
        getId() {
          return id;
        },
        moveTo(folder) {
          calls.push({ op: 'DriveApp.getFileById.moveTo', id, folder: folder.getId() });
          const f = driveFiles[id];
          if (f.folderId && folders[f.folderId]) {
            const idx = folders[f.folderId]._fileIds.indexOf(id);
            if (idx >= 0) folders[f.folderId]._fileIds.splice(idx, 1);
          }
          f.folderId = folder.getId();
          folder._fileIds.push(id);
          return this;
        }
      };
    },
    _register(folder) {
      folders[folder.getId()] = folder;
    },
    // Test helper: registers an existing (not-created-by-DocumentApp) file, optionally in a folder.
    _registerFile(id, name, mimeType, folderId) {
      driveFiles[id] = { id, name, mimeType, folderId: folderId || null };
      if (folderId && folders[folderId]) folders[folderId]._fileIds.push(id);
    }
  };

  function makeDocWrapper(id) {
    return {
      getId() {
        return id;
      },
      getUrl() {
        return 'https://docs.google.com/document/d/' + id;
      },
      getName() {
        return docs[id].name;
      },
      getBody() {
        return {
          setText(t) {
            calls.push({ op: 'doc.setText', id });
            docs[id].text = t;
            return this;
          },
          getText() {
            return docs[id].text;
          }
        };
      }
    };
  }

  const DocumentApp = {
    create(title) {
      calls.push({ op: 'DocumentApp.create', title });
      docCounter++;
      const id = 'doc_' + docCounter;
      docs[id] = { id, name: title, text: '' };
      driveFiles[id] = { id, name: title, mimeType: 'GOOGLE_DOCS', folderId: null };
      return makeDocWrapper(id);
    },
    openById(id) {
      calls.push({ op: 'DocumentApp.openById', id });
      if (!docs[id]) throw new Error('No doc: ' + id);
      return makeDocWrapper(id);
    },
    // Test helper: simulates a pre-existing Google Doc so openById()/importDoc work in tests.
    _registerDoc(id, name, text, folderId) {
      docs[id] = { id, name, text: text || '' };
      driveFiles[id] = { id, name, mimeType: 'GOOGLE_DOCS', folderId: folderId || null };
      if (folderId && folders[folderId]) folders[folderId]._fileIds.push(id);
    }
  };

  const MimeType = { GOOGLE_DOCS: 'GOOGLE_DOCS' };

  const cacheStore = {};
  const CacheService = {
    getScriptCache() {
      return {
        get(key) {
          return Object.prototype.hasOwnProperty.call(cacheStore, key) ? cacheStore[key] : null;
        },
        put(key, value, ttlSeconds) {
          calls.push({ op: 'cache.put', key, ttlSeconds });
          cacheStore[key] = String(value);
        },
        remove(key) {
          calls.push({ op: 'cache.remove', key });
          delete cacheStore[key];
        }
      };
    }
  };

  const LockService = {
    getScriptLock() {
      return {
        waitLock(ms) {
          calls.push({ op: 'lock.waitLock', ms });
        },
        releaseLock() {
          calls.push({ op: 'lock.releaseLock' });
        }
      };
    }
  };

  function toSignedBytes(buffer) {
    const out = [];
    for (const b of buffer) out.push(b > 127 ? b - 256 : b);
    return out;
  }

  const Utilities = {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    computeDigest(algorithm, value) {
      const hash = crypto.createHash('sha256').update(String(value), 'utf8').digest();
      return toSignedBytes(hash);
    },
    getUuid() {
      return crypto.randomUUID();
    }
  };

  const consoleMock = {
    log() {
      calls.push({ op: 'console.log' });
    },
    error() {
      calls.push({ op: 'console.error' });
    },
    warn() {
      calls.push({ op: 'console.warn' });
    }
  };

  const Logger = {
    log() {
      calls.push({ op: 'Logger.log' });
    }
  };

  const ContentService = {
    MimeType: { JSON: 'JSON' },
    createTextOutput(text) {
      let mime = null;
      const out = {
        setMimeType(m) {
          mime = m;
          return out;
        },
        getContent() {
          return text;
        },
        getMimeType() {
          return mime;
        }
      };
      return out;
    }
  };

  return {
    calls,
    props,
    spreadsheets,
    folders,
    driveFiles,
    docs,
    cacheStore,
    PropertiesService,
    SpreadsheetApp,
    DriveApp,
    DocumentApp,
    MimeType,
    CacheService,
    LockService,
    Utilities,
    Logger,
    console: consoleMock,
    ContentService,
    makeSheet,
    makeSpreadsheet
  };
}

module.exports = { loadGas, createMockEnv, GAS_DIR };
