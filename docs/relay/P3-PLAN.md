<!-- PLAN-RELAY:EXECUTE -->
# P3 PWA Shell + Login + Post Library — Execution Plan

## Instructions for the AI reading this file
You are the executor. Follow every step literally. Do not work outside SCOPE. Never violate CONSTRAINTS.
If something is genuinely ambiguous, STOP and write the question in the OUTPUT file — do not invent product behaviour.

## 1. CONTEXT
Project root `C:\Users\LENOVO\1xClaude-Projects\tww-content-writer-hub`. Frontend lives in `web/` and will be hosted on GitHub Pages
(static, no build step). `web/package.json` = `{"type":"module"}`; engine already in `web/js/engine/` (do not modify).
Backend = Google Apps Script web app, already deployed. Read `docs/API.md` for every action. API URL (not a secret):
`https://script.google.com/macros/s/AKfycbwXbLVG66uewdwFET6nfc5NDyVw5P6NXvOjxBSsYXsA6Ex0FALaW5CQmZnEZcIPTr5bmw/exec`
Call pattern (must be exactly this to avoid CORS preflight):
`fetch(API_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({action, token, ...payload}), redirect:'follow' })`
→ JSON `{ok:true,data}` or `{ok:false,error,message}`.
Users: a few Thai friends writing real-estate posts for the Facebook page "ที่ว่างว่าง". UI language: Thai. Mobile-first.

Design system (mandatory):
- Colors: paper background `#F3EFE6`, ink text `#1F1D1A`, accent brick `#A8431F`; status "ไม่รอด" `#B3261E`; "รอด" `#4F6128`; "คุ้ม" `#2F3B14`.
  Derive a few neutrals only from these (e.g. ink at 60%/12% opacity for secondary text/borders; white-ish card `#FBF9F4`).
- Fonts (Google Fonts, one `<link>`): Anuphan (headings, 500/600), IBM Plex Sans Thai (body, 400/500), IBM Plex Mono (all numbers, 400/500).
- NO emoji anywhere in UI. Icons, if any, = inline SVG strokes in ink color.
- Every button / tappable control min-height 44px, min-width 44px. Base font 16px; inputs 16px (prevents iOS zoom).
- Layout max-width 640px centered; 16px side gutter; no horizontal scroll at 360px width.

## 2. GOAL
An installable PWA shell with hash routing, one-time login (token kept in localStorage), and the home "คลังโพสต์" (post library)
showing everyone's posts with filters ทั้งหมด / ของฉัน / เพื่อน and project-name search; placeholders for later screens.

## 3. SCOPE / OUT OF SCOPE
- Do: files in T1, local dev server, icons generator, Node tests for pure helpers, `.claude/launch.json`.
- Do NOT: build the write-post flow, format extractor, style DNA screens (only placeholders); modify `gas/` or `web/js/engine/`;
  commit; deploy; add npm dependencies; call any AI API; use `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write` anywhere.

## 4. TASKS

### T1 Files
```
web/index.html
web/manifest.webmanifest
web/sw.js
web/icons/icon-192.png  icon-512.png  icon-maskable-512.png  apple-touch-icon.png (180)
web/css/app.css
web/js/config.js        export const API_URL = '...'; export const APP_VERSION = '0.3.0';
web/js/api.js
web/js/store.js         token + user + cached lists in localStorage (all access wrapped in try/catch)
web/js/router.js
web/js/dom.js           h(tag, attrs, ...children) builder using createElement/textContent only
web/js/format-th.js     pure helpers (Thai date, status labels/colors, summary parsing) — testable in Node
web/js/app.js           bootstrap: register SW, header, router start
web/js/views/login.js
web/js/views/library.js
web/js/views/placeholder.js
scripts/make-icons.mjs  generates the PNGs with node:zlib (no deps)
scripts/serve.mjs       static server for web/ on http://localhost:5173 (node:http, correct MIME for .js .mjs .json .webmanifest .png .css .svg)
.claude/launch.json     { "version":"0.0.1", "configurations":[{ "name":"web", "runtimeExecutable":"node", "runtimeArgs":["scripts/serve.mjs"], "port":5173 }] }
tests/web-format.test.mjs
tests/web-static.test.mjs
```
package.json: add `"dev": "node scripts/serve.mjs"`, `"icons": "node scripts/make-icons.mjs"`.

### T2 index.html
`<html lang="th">`, viewport `width=device-width, initial-scale=1, viewport-fit=cover`, `<meta name="theme-color" content="#A8431F">`,
`<title>ที่ว่างว่าง Writer</title>`, manifest link, apple-touch-icon, apple-mobile-web-app-capable meta, fonts link
(`https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600&family=IBM+Plex+Sans+Thai:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap`
with preconnects), `css/app.css`, `<div id="app"></div>`, `<script type="module" src="js/app.js"></script>`. All paths RELATIVE
(site will live under `/<repo>/` on GitHub Pages).

### T3 manifest + SW + icons
- manifest: `name` "ที่ว่างว่าง Content Writer Hub", `short_name` "ที่ว่างว่าง", `start_url` "./", `scope` "./", `display` "standalone",
  `background_color` "#F3EFE6", `theme_color` "#A8431F", `lang` "th", icons 192, 512 (purpose any) and maskable 512.
- sw.js: `CACHE = 'tww-shell-v0.3.0'`; on install precache the shell list (index.html, css, all js files incl. engine files, manifest, icons);
  activate → delete OTHER caches whose name starts with `tww-shell-` (only our own caches); fetch: if request URL host is
  `script.google.com` or `script.googleusercontent.com` or method != GET → do not intercept (network only, never cache API).
  Same-origin GET → stale-while-revalidate from CACHE; navigation requests fall back to cached `index.html` when offline.
  Google Fonts: cache-first in a separate cache `tww-fonts`.
- make-icons.mjs: write real PNG files (RGBA, zlib deflate, CRC32 implemented in script). Design: brick `#A8431F` square background;
  centered paper-colored `#F3EFE6` square outline (stroke ≈ 8% of size) with a gap cut in the top edge (an "empty lot" mark). Maskable:
  same but mark scaled to fit the 80% safe zone. apple-touch-icon 180 = non-maskable design. Run it once so PNGs exist.

### T4 api.js / store.js / router.js
- `api(action, payload = {})` → adds `token` from store; network error → throw `{code:'NETWORK'}`; `{ok:false}` → throw `{code:error, message}`;
  on `UNAUTHORIZED` → `store.clearAuth()` and `location.hash = '#/login'` before throwing. Returns `data`.
- store keys: `tww.token`, `tww.user` (JSON), `tww.cache.posts.<scope>` (JSON, last successful list). Functions: `getToken, setAuth(token,user),
  clearAuth, getUser, cacheGet(key), cacheSet(key,val)`. Every localStorage access in try/catch; failure = behave as empty.
- router: hash routes → view functions `(el, params)`:
  `#/login` login; `#/` library; `#/new` placeholder "เลือกรูปแบบโพสต์ (กำลังสร้าง)"; `#/post/:id` placeholder "ดูโพสต์ (กำลังสร้าง)";
  `#/admin/formats` placeholder (admin only, else redirect `#/`); `#/style` placeholder "Style DNA (กำลังสร้าง)".
  Any route except `#/login` without a token → redirect `#/login`. Logged in + `#/login` → redirect `#/`. Unknown → `#/`.

### T5 Views
**Header** (all screens except login): app name "ที่ว่างว่าง" in Anuphan, right side: user display_name + "ออกจากระบบ" text button
(calls `auth.logout`, ignores errors, clears auth, goes to login). Admin also sees a link "ถอดรูปแบบ" → `#/admin/formats`. Link "สไตล์ของฉัน" → `#/style`.
**Login**: title "เข้าสู่ระบบ", fields "ชื่อผู้ใช้" (autocomplete username, autocapitalize off) and "รหัสผ่าน" (type password, autocomplete current-password),
button "เข้าสู่ระบบ" full width. Submit → `auth.login` → `setAuth` → `#/`. Errors in Thai inline under the button:
BAD_CREDENTIALS "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง", LOCKED "ลองผิดหลายครั้ง กรุณารอ 15 นาที", NETWORK "เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง",
other "เกิดข้อผิดพลาด (<code>)". Disable button + text "กำลังเข้าสู่ระบบ…" while pending. Never store the password.
**Library** (`#/`): heading "คลังโพสต์"; segmented control of 3 buttons ทั้งหมด / ของฉัน / เพื่อน (`aria-pressed`), selected = brick fill, paper text;
search input placeholder "ค้นชื่อโครงการหรือทำเล" (debounce 300 ms) → `posts.list {scope, q}`. Remember last scope in localStorage.
Show cached list immediately (if any) then refresh; while loading with no cache show 3 skeleton cards. Each card (button-like `<a href="#/post/<id>">`):
project_name (Anuphan 600), location (secondary), meta row: author_name · format_name · status pill · date (Thai short date, e.g. "29 ก.ย. 69" from
updated_at); case summary line rendered by `parseSummary` → segments where words ไม่รอด/รอด/คุ้ม get their status color and mono font for numbers.
Status pill labels: draft "ร่าง", ready "พร้อมโพสต์", posted "โพสต์แล้ว" (outline style, ink 60%). Empty state: "ยังไม่มีโพสต์ในมุมนี้".
Error state with "ลองใหม่" button. Sticky bottom bar with primary button "เขียนโพสต์ใหม่" → `#/new` (full width, safe-area padding).
**Placeholder**: heading + the text given in T4 + link "กลับคลังโพสต์".

### T6 format-th.js (pure, exported, Node-testable)
- `thaiShortDate(iso)` → `"29 ก.ย. 69"` (Buddhist year 2-digit, Asia/Bangkok timezone; implement offset manually +7h, no Intl dependency for tz).
- `postStatusLabel(s)` → mapping above; unknown → s.
- `verdictColor(word)` → ไม่รอด `#B3261E`, รอด `#4F6128`, คุ้ม `#2F3B14`, else null.
- `parseSummary(text)` → array of `{text, verdict|null}` splitting on the verdict words (match "ไม่รอด" before "รอด").

### T7 CSS
CSS custom properties on `:root` for all colors/fonts/spacing; body background paper, color ink; `.num` class = IBM Plex Mono with
`font-variant-numeric: tabular-nums`. Focus-visible outline 2px brick. Respect `prefers-reduced-motion` (no skeleton shimmer).
Dark mode: NOT required (paper look is the brand); force `color-scheme: light`.

### T8 Tests
- `web-format.test.mjs`: thaiShortDate('2026-09-28T17:30:00Z') === '29 ก.ย. 69' (Bangkok next day); '2026-01-05T03:00:00Z' → '5 ม.ค. 69';
  postStatusLabel; verdictColor; parseSummary('Case 1 · Low ไม่รอด · Case 2 · Mid รอด · Case 3 · High คุ้ม') → verdicts in order ['ไม่รอด','รอด','คุ้ม'] and
  'ไม่รอด' not split into 'ไม่' + 'รอด'.
- `web-static.test.mjs`: scan `web/**/*.{js,html,css}` (excluding nothing): no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval(`;
  no emoji (regex `\p{Extended_Pictographic}` with `u` flag) in any web file; manifest has required fields + 3 icons that exist on disk;
  each icon file starts with the PNG signature and has the declared width/height in its IHDR; every path in sw.js precache list exists on disk;
  `config.js` API_URL ends with `/exec`; index.html has no absolute `/` asset paths.

## 5. CONSTRAINTS
- Vanilla JS ES modules, no frameworks, no build step, no npm deps.
- Never render server/user data via HTML strings — `textContent`/`createElement` only.
- Password never written to storage or logs.
- P0–P2 tests still pass. `npm test` 0 failures. Do not touch `gas/` or `web/js/engine/`.

## 6. ACCEPTANCE CRITERIA
- [ ] AC1: `npm test` passes all tests.
- [ ] AC2: `node scripts/serve.mjs` serves the app at http://localhost:5173 (verify with a request to `/` and `/manifest.webmanifest` → 200 and correct content-types; report them).
- [ ] AC3: Routes, auth redirect and logout behave per T4/T5 (describe how verified).
- [ ] AC4: Library implements 3 filters, debounced search, cache-then-refresh, card fields, verdict colors, status pills, sticky new-post button.
- [ ] AC5: Design constraints: colors/fonts from T1 context, no emoji, controls ≥ 44px (list the CSS rules that enforce it).
- [ ] AC6: SW never caches API hosts; only deletes its own `tww-shell-*` caches.

## 7. Delivery format
Write `docs/relay/P3-OUTPUT.md` starting with `<!-- PLAN-RELAY:REVIEW -->`: file list, `npm test` summary, AC2 evidence, SELF-CHECK per AC,
deviations/questions ("None" if none). Then reply with a 5-line report.
