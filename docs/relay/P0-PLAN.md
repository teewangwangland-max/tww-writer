<!-- PLAN-RELAY:EXECUTE -->
# P0 Project Scaffold + Sheet Setup — Execution Plan

## Instructions for the AI reading this file
You are the executor of this plan. Follow every step without asking questions already answered here.
Do not work outside SCOPE. Never violate CONSTRAINTS. If something is genuinely ambiguous or missing,
STOP and ask back (write the question in OUTPUT) — do not decide product behaviour yourself.
When finished, write the OUTPUT file described in section 7.

## 1. CONTEXT
Project root: `C:\Users\LENOVO\1xClaude-Projects\tww-content-writer-hub` (currently empty except `docs/relay/`).
"TeeWangwang Content Writer Hub" = a PWA where a few friends write Thai real-estate analysis posts.
Architecture (decided):
- Backend: Google Apps Script (standalone script, V8) + one Google Sheet, owned by teewangwangland@gmail.com.
  Developed locally with `clasp` 3.3.0; clasp login profile name is `teewangwangland`, so EVERY clasp
  command must end with `--user teewangwangland`.
- Frontend: static files in `web/` served later by GitHub Pages, calling the GAS web app as a JSON API
  (POST with `Content-Type: text/plain` body = JSON string, to avoid CORS preflight).
- The app NEVER calls any AI API. No API keys anywhere.
- Node 24 is available for local tests (`node --test`, no external test framework).

Later phases (NOT this phase) will add: calc engine (P1), API/auth (P2), web UI (P3+).
This phase builds the folder skeleton and the idempotent `setup()` that creates the Sheet tabs + a Drive folder.

## 2. GOAL
A git-initialised repo with the agreed folder layout, a GAS source folder containing `Config.gs` (schema),
`Setup.gs` (idempotent, non-destructive setup), `Api.gs` (health stub), and a Node test proving `setup()`
is idempotent and never deletes/overwrites data, using mocked Apps Script services.

## 3. SCOPE / OUT OF SCOPE
- Do: create files listed in TASKS; `git init` (branch `main`); `npm test` must pass.
- Do NOT: run any `clasp` command; create a remote project; `git commit`; `git push`; add auth, UI, or engine code;
  install npm dependencies (package.json must have zero dependencies).

## 4. TASKS

### T1 Folder layout (create exactly)
```
gas/                 Apps Script source (clasp rootDir)
  appsscript.json
  Config.gs
  Setup.gs
  Api.gs
web/
  index.html         placeholder page: <title>TWW Content Writer Hub</title>, body text "กำลังสร้าง"
tests/
  helpers/gas-mock.js
  setup.test.js
seed/.gitkeep
docs/relay/          (exists)
gas/.claspignore     (see T6)
.gitignore
package.json
README.md
```

### T2 `gas/appsscript.json`
```json
{
  "timeZone": "Asia/Bangkok",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents"
  ],
  "webapp": { "access": "ANYONE_ANONYMOUS", "executeAs": "USER_DEPLOYING" }
}
```

### T3 `gas/Config.gs`
Top-level constants (plain `var`/`const` globals — Apps Script shares a global scope across files; no modules, no `import`/`export`):
- `APP_NAME = 'TWW Content Writer Hub'`
- `APP_VERSION = '0.1.0'`
- `DB_NAME = 'TWW Content Writer Hub DB'`
- `DOCS_FOLDER_NAME = 'TWW Content Writer Hub - Posts'`
- `PROP_SHEET_ID = 'SHEET_ID'`, `PROP_DOCS_FOLDER_ID = 'DOCS_FOLDER_ID'` (Script Property keys)
- `SCHEMA` = object mapping tab name → header array, EXACTLY in this order:

| Tab | Headers |
|---|---|
| Users | user_id, username, display_name, role, pass_hash, pass_salt, playfulness_default, catchphrases, avoid_list, active, created_at |
| Sessions | token_hash, user_id, created_at, expires_at, last_seen_at |
| Posts | post_id, user_id, format_id, project_name, location, post_status, case_summary, inputs_json, results_json, narrative_json, tone_json, body, doc_url, is_style_example, created_at, updated_at |
| Examples | example_id, owner, format_id, title, body, source, source_ref, created_by, created_at, active |
| StyleDNA | dna_id, scope, version, dna_json, changelog, source_example_ids, created_by, created_at, is_current |
| Formats | format_id, name, version, status, spec_json, created_by, created_at, updated_at |
| Comps | comp_id, project_name, location, price_per_sqm, source, note, created_by, created_at |

Tab order in `SCHEMA` = the order above.

### T4 `gas/Setup.gs`
Function `setup()` — safe to run any number of times. Returns (and `Logger.log`s) a report object:
`{ sheetId, sheetUrl, docsFolderId, created: [tabNames], ok: [tabNames], warnings: [strings] }`.
Algorithm:
1. `props = PropertiesService.getScriptProperties()`.
2. Spreadsheet: if `props.getProperty(PROP_SHEET_ID)` is set → `SpreadsheetApp.openById(id)`.
   Otherwise `SpreadsheetApp.create(DB_NAME)` and store its id in the property.
3. For each tab in `SCHEMA` (in order):
   - Sheet missing → `ss.insertSheet(name)`, write headers to row 1 (`getRange(1,1,1,n).setValues([headers])`),
     `setFrozenRows(1)`; push name to `created`.
   - Sheet exists and row 1 is completely empty (sheet `getLastRow() === 0`) → write headers as above; push to `created`.
   - Sheet exists with data → read row 1 (width = max(lastColumn, headers.length)); if it equals `headers` exactly → push to `ok`;
     else push a warning `"<Tab>: header mismatch, expected [...] got [...]"` and DO NOT change anything.
4. After tabs: if a sheet named `Sheet1` or `แผ่น1` exists, has `getLastRow() === 0`, and the spreadsheet was created in THIS run
   → delete it (it is the empty default tab of a brand-new file). In every other case leave it alone.
   This is the ONLY deletion allowed anywhere, and only for a file created in the same run.
5. Drive folder: if `PROP_DOCS_FOLDER_ID` set → `DriveApp.getFolderById(id)` (if it throws, push a warning, do not create a new one).
   Otherwise `DriveApp.createFolder(DOCS_FOLDER_NAME)` and store its id.
6. Return report.
Never call: `clear`, `clearContents`, `deleteRow(s)`, `deleteColumn(s)`, `setTrashed`, `removeFile`, `deleteSheet` (except rule in step 4).

### T5 `gas/Api.gs`
- `doGet(e)` → `ContentService.createTextOutput(JSON.stringify({ ok: true, app: APP_NAME, version: APP_VERSION })).setMimeType(ContentService.MimeType.JSON)`.
- `doPost(e)` → parse `e.postData.contents` as JSON (catch errors → `{ok:false, error:'BAD_JSON'}`);
  if `body.action === 'ping'` → `{ ok: true, data: { pong: true, version: APP_VERSION } }`;
  otherwise `{ ok: false, error: 'UNKNOWN_ACTION' }`. Always JSON output via a helper `jsonOut_(obj)`.
- Keep a `ROUTES` object `{ ping: function(body){...} }` so later phases add routes there.

### T6 Root files
- `.gitignore`: `node_modules/`, `.clasprc.json`, `.env*`, `*.local.*`, `.DS_Store`, `Thumbs.db`.
- `gas/.claspignore` containing `**/*.md` only (no root-level `.claspignore`).
- `package.json`: name `tww-content-writer-hub`, private true, no dependencies, scripts:
  - `"test": "node --test tests/"`
  - `"gas:push": "clasp push --user teewangwangland"`
  - `"gas:status": "clasp status --user teewangwangland"`
- `README.md` (Thai, short): what the project is, folder layout, "every clasp command ends with `--user teewangwangland`",
  "deploy GAS = always New Version, never overwrite an existing deployment", "never put passwords/credentials in code".
- Run `git init -b main`. Do NOT commit.

### T7 Tests — `tests/helpers/gas-mock.js` + `tests/setup.test.js`
- `gas-mock.js` exports `loadGas(files, mocks)` that reads the listed `gas/*.gs` files, concatenates them, and runs them in a
  `node:vm` context whose globals are the provided mocks; returns the context.
- Mocks to implement (in-memory, minimal): `PropertiesService.getScriptProperties()` (get/setProperty),
  `SpreadsheetApp` (`create`, `openById`, spreadsheet with `getId`, `getUrl`, `getSheetByName`, `getSheets`, `insertSheet`,
  `deleteSheet`; sheet with `getName`, `getLastRow`, `getLastColumn`, `getRange(r,c,nr,nc)` → `getValues/setValues`, `setFrozenRows`),
  `DriveApp` (`createFolder`, `getFolderById`), `Logger.log`, `ContentService` (createTextOutput → object with setMimeType
  returning itself and `getContent()`), `ContentService.MimeType.JSON`.
  Every mutating mock call is recorded in a `calls` array so tests can assert on it. A newly created spreadsheet starts with one
  empty sheet named `Sheet1`.
- `setup.test.js` tests (all must pass):
  1. First run on empty props: creates all 7 tabs with exact headers in row 1, deletes empty `Sheet1`, stores both properties.
  2. Second run: `created` is empty, `ok` has all 7 tabs, no `insertSheet`/`deleteSheet`/`createFolder`/`SpreadsheetApp.create` calls.
  3. Existing spreadsheet (props preset) where `Posts` has a data row and a different header: nothing written to `Posts`, a warning mentions `Posts`.
  4. Existing spreadsheet containing an empty `Sheet1` not created this run: `Sheet1` is NOT deleted.
  5. `doGet` returns JSON with `ok:true` and version `0.1.0`; `doPost` with `{"action":"ping"}` returns `pong:true`; with `not json` returns `BAD_JSON`.
  6. Static scan: no file in `gas/` contains `eval(`, `new Function`, `.clear(`, `clearContents`, `deleteRow`, `setTrashed`.

## 5. CONSTRAINTS
- Apps Script V8 compatible JS in `gas/` (no `import`/`export`, no `require`, no optional npm libs).
- No credentials, passwords, tokens or API keys in any file.
- Zero npm dependencies. Tests use only `node:test`, `node:assert`, `node:vm`, `node:fs`, `node:path`.
- Do not run clasp. Do not commit. Do not touch anything outside the project root.

## 6. ACCEPTANCE CRITERIA
- [ ] AC1: File layout matches T1 (with `.claspignore` inside `gas/`), `git status` works on branch `main`, no commits exist.
- [ ] AC2: `gas/Config.gs` SCHEMA has exactly the 7 tabs and headers from T3, in order.
- [ ] AC3: `npm test` passes all 6 tests in T7 (0 failures).
- [ ] AC4: `setup()` contains no destructive call except the guarded default-sheet delete of step 4.
- [ ] AC5: `package.json` has no `dependencies`/`devDependencies`; clasp scripts end with `--user teewangwangland`.
- [ ] AC6: No credential-like strings in repo (grep for `password\s*=`, `api[_-]?key`, `token\s*=\s*['"]` finds nothing in code).

## 7. Delivery format
Write `docs/relay/P0-OUTPUT.md` starting with `<!-- PLAN-RELAY:REVIEW -->`, containing:
1. File tree created.
2. Full `npm test` output (last 30 lines is enough if long).
3. SELF-CHECK: each AC with pass/fail + one-line evidence.
4. Any questions / deviations (if none, write "None").
Then reply with a 5-line report.
