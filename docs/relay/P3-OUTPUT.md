<!-- PLAN-RELAY:REVIEW -->
# P3 OUTPUT

## Files
Created: web/index.html (replaced stub), web/manifest.webmanifest, web/sw.js, web/icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png,
web/css/app.css, web/js/{config,api,store,router,dom,format-th,app}.js, web/js/views/{login,library,placeholder}.js,
scripts/make-icons.mjs, scripts/serve.mjs, .claude/launch.json, tests/web-format.test.mjs, tests/web-static.test.mjs.
Modified: package.json (added `dev`, `icons`). Untouched: gas/, web/js/engine/.

## npm test
54 tests, 54 pass, 0 fail (P0-P2 plus new web-format and web-static).

## AC2 evidence (node scripts/serve.mjs, port 5173)
- `/` -> 200 text/html; charset=utf-8
- `/manifest.webmanifest` -> 200 application/manifest+json; charset=utf-8
- `/js/app.js` -> 200 text/javascript; `/css/app.css` -> 200 text/css; `/icons/icon-192.png` -> 200 image/png; `/sw.js` -> 200 text/javascript
- Path traversal is neutralised (URL normalisation plus a root-prefix check).

## SELF-CHECK
| AC | Result | How verified |
|---|---|---|
| AC1 | PASS | `npm test`: 54/54 |
| AC2 | PASS | curl results above |
| AC3 | PASS (logic) | `resolve()` in router.js exercised in Node: no token -> `/login`; token + `/login` -> `/`; non-admin `/admin/formats` -> `/`; admin allowed; `/post/abc` gives id=abc; unknown -> `/`. Logout = `auth.logout` (errors ignored), `clearAuth`, `#/login`. Not exercised in a real browser (no browser run). |
| AC4 | PASS (code review, not browser-run) | library.js: 3 scope buttons with aria-pressed, scope remembered (`tww.pref.scope`), 300 ms debounced search, cached list shown first then refresh, 3 skeletons when no cache, card fields, verdict colors via parseSummary, outline status pills, empty state, error state with "ลองใหม่", sticky bottom button. Live API calls were not made. |
| AC5 | PASS | Colors/fonts from :root vars. No emoji (test enforces). 44px rules in app.css: `--tap: 44px` used by `.brand`, `.link-btn`, `.btn`, `.input`, `.seg-btn`, `.card` (min-height/min-width). Inputs and base font 16px. `#app` max-width 640px, 16px gutter, `overflow-x: hidden`. |
| AC6 | PASS | sw.js: returns early (no respondWith) for non-GET and for script.google.com / script.googleusercontent.com; activate deletes only keys starting `tww-shell-` other than current; fonts in separate `tww-fonts`. |

## NOTES / deviations
None from the plan. Small decisions: added `prefGet/prefSet` to store.js for the remembered scope (plan listed only the core functions); placeholder `#/admin/formats` shows heading "ถอดรูปแบบ" with text "ถอดรูปแบบ (กำลังสร้าง)" since the plan gave no text; precache test also asserts every web/js file is in the SHELL list.
