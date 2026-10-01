<!-- PLAN-RELAY:EXECUTE -->
# P4 Write-Post Flow (spec-driven) — Execution Plan

## Instructions for the AI reading this file
You are the executor. Follow every step literally. Do not work outside SCOPE. Never violate CONSTRAINTS.
If something is genuinely ambiguous, STOP and write the question in the OUTPUT file — do not invent product behaviour.

## 1. CONTEXT
Project root `C:\Users\LENOVO\1xClaude-Projects\tww-content-writer-hub`. Read first:
- `web/js/router.js`, `api.js`, `store.js`, `dom.js`, `format-th.js`, `views/library.js`, `css/app.css`, `sw.js` (P3 shell; follow its style).
- `web/js/engine/index.js` and the engine files: `validateSpec`, `compute`, `checkPost`, `autofix`, `formatValue`, `formatNumberPart`.
- `docs/API.md` (all backend actions), `seed/formats/feasibility-3case.json` (the spec shape), `tests/fixtures/klos-inputs.json`, `tests/fixtures/klos-post-swapped.txt`.
Product rules (non-negotiable): every number is computed by code; the AI only narrates. **The app never calls any AI API** — it builds a
prompt, the user copies it into their own Gemini/Claude/ChatGPT, then pastes the result back. Every screen of this flow is rendered from the
format spec (no format-specific code: never test for `feasibility-3case` or field keys like `loft_pct` in UI code).
Design rules from P3 apply (paper/ink/brick colors, Anuphan/IBM Plex Sans Thai/IBM Plex Mono for numbers, no emoji, controls ≥ 44px,
no innerHTML-family APIs — `dom.js` `h()` + textContent only).

## 2. GOAL
A user can: pick a format → fill inputs → calculate → see results + notes → fill story ingredients + tone → copy a complete prompt
(+ open Gemini/Claude/ChatGPT) → paste the AI's post back, edit it, see wrong numbers highlighted with one-tap fixes → save
(save only / save + new Google Doc / copy for Facebook), optionally "เก็บเป็นตัวอย่างสอนสไตล์". Saved posts open at `#/post/:id`; the owner can edit.

## 3. SCOPE / OUT OF SCOPE
- Do: new views/modules below, router entries, CSS additions, sw.js precache update, tests.
- Do NOT: change `gas/` or `web/js/engine/` (if you believe the engine has a bug, STOP and report); build the format-extractor or Style DNA
  editing screens (P5/P6); call any AI/HTTP API other than our GAS `api()`; commit; deploy; add npm deps.

## 4. TASKS

### T1 Routes (add to router.js; keep existing)
| hash | view |
|---|---|
| `#/new` | `views/pick-format.js` — list `formats.list` (cards: name, version); tap → `#/new/<format_id>` |
| `#/new/:formatId` | `views/wizard.js` new post |
| `#/edit/:postId` | `views/wizard.js` editing an existing own post (non-owner → redirect `#/post/:id`) |
| `#/post/:id` | `views/post-view.js` |

### T2 Wizard state + autosave (`web/js/wizard-state.js`, pure)
State object: `{ v:1, postId|null, formatId, formatVersion, step, inputs, narrative, tone:{playfulness, options:[]}, body, saveAsExample:false, updatedAt }`.
Autosave to localStorage key `tww.draft.<formatId>` (new) or `tww.draft.post.<postId>` (edit) on every change (debounce 500 ms).
Opening `#/new/:formatId` with an existing draft shows a bar "มีร่างที่ยังไม่บันทึก" + buttons "ทำต่อ" / "เริ่มใหม่" ("เริ่มใหม่" asks inline
confirmation "ล้างร่างนี้?" ใช่/ไม่). Successful server save removes the local draft. Export pure helpers: `emptyState(spec, user)`
(fills field defaults, case_table defaults from `spec.cases[].inputs`, playfulness from user.playfulness_default or 3), `serialize`, `deserialize`.

### T3 Wizard steps (one screen, stepper header "1 กรอก · 2 ผลคำนวณ · 3 เตรียม prompt · 4 วางโพสต์ · 5 บันทึก"; tapping a done step goes back)
**Step 1 กรอกข้อมูล** — render `spec.fields` in order (`web/js/fields.js`, one renderer per type):
- `text`: input text. `number`: input `inputmode="decimal"`, raw text kept (engine accepts "300,000"); unit shown as suffix label.
- `rai_ngan_wa`: three inputs in one row labelled ไร่ / งาน / วา → value `{rai, ngan, wa}`.
- `case_table`: grid, one row per `spec.cases` (label) × `columns` (inputs).
- `comps_table`: rows of [ชื่อโครงการ text][ราคา/ตร.ม. number][ลบแถว]; button "เพิ่มแถว"; button "เลือกจากคลัง Comps" opens a sheet listing
  `comps.list` (search box, tap to add row); each row whose name is not in the library has a small text button "เก็บเข้าคลัง" → `comps.add`
  (button becomes "เก็บแล้ว"). Show live count/avg under the table using `formatValue` with `{type:'thousand',dp:1,suffix:'k'}`.
- Required fields marked "*". Button "คำนวณ" → `compute(spec, inputs)`; if `MISSING_INPUT` errors, show "กรอกให้ครบ: <labels>" and
  mark those fields; otherwise go to step 2.
**Step 2 ผลคำนวณ** (`web/js/results-view.js`, reused by post-view): summary line (verdict colors like the library card); table of
`result.global` (label | value in `.num`); then for cases: on screens ≥ 560px a table (rows = per-case formula labels, columns = cases);
below 560px one block per case. Rows whose `key` is the summary `per_case_key` render as a colored verdict pill. Below: `spec.notes` as a
"ข้อสังเกต" list. Buttons "แก้ตัวเลข" (step 1) and "ต่อไป" (step 3).
**Step 3 เตรียม prompt** — inputs for `spec.narrative_fields` (textarea each, label + hint); "ระดับความขี้เล่น" 5 segmented buttons 1–5 with the
caption for the selected level (T5); checkboxes for `spec.tone_options` (label). Button "คัดลอก prompt" builds the prompt (T4/T5), copies it
(`navigator.clipboard.writeText`, fallback hidden textarea + `document.execCommand('copy')`), shows "คัดลอกแล้ว (<n> ตัวอักษร)". Then three
link-buttons opening in a new tab with `rel="noopener noreferrer"`: Gemini `https://gemini.google.com/app`, Claude `https://claude.ai/new`,
ChatGPT `https://chatgpt.com/`. A collapsible "ดู prompt" shows the prompt in a read-only `<pre>`. Button "ต่อไป: วางโพสต์".
If examples/style could not be loaded, show a non-blocking line "ยังไม่มีตัวอย่างโพสต์ของรูปแบบนี้ — prompt จะไม่มีตัวอย่าง" etc.
**Step 4 วางโพสต์** (`web/js/checker-view.js`) — big textarea "วางโพสต์จาก AI ที่นี่" (min 12 rows, user can edit freely). On input
(debounce 400 ms) run `checkPost(body, spec, result, inputs)`. Show:
- status line: "ตัวเลขตรง <ok> จุด · ไม่ตรง <mismatch> จุด · ไม่พบในโพสต์ <missing> · ตรวจไม่ได้ <unverified>";
- a read-only highlighted preview below the textarea built from text segments: mismatch spans = red underline + background tint of `#B3261E`
  at 12%, unverified = dotted ink underline; everything as text nodes;
- an issue list: for each mismatch "<case label if any> · <formula label>: เขียน <raw> ควรเป็น <expectedText><suffix-free>" + button "แก้ให้"
  (applies `autofix(body, [issue])` and re-checks); a button "แก้ทั้งหมด" when ≥ 2 mismatches (applies `autofix(body, mismatches)`);
  `missing` items listed as info ("ไม่พบ <label>"). Label lookup: formula label from spec by `checkKey`; case label from spec.cases.
- Button "ต่อไป: บันทึก".
**Step 5 บันทึก** — checkbox "เก็บเป็นตัวอย่างสอนสไตล์"; if mismatches > 0 show warning "ยังมีตัวเลขไม่ตรง <n> จุด" and require ticking
"บันทึกทั้งที่ยังไม่ตรง" before the save buttons enable. Three buttons:
1. "บันทึก" → `posts.save` (post_status `ready` if body non-empty else `draft`).
2. "บันทึก + สร้าง Google Doc" → same with `createDoc:true`; show returned Doc link "เปิด Google Doc".
3. "คัดลอกไปโพสต์ Facebook" → copy body to clipboard, `posts.save` with post_status `posted`; show "คัดลอกแล้ว" + link "เปิด Facebook" (`https://www.facebook.com/`).
`posts.save` payload: `post = { post_id?, format_id, project_name, location, post_status, case_summary: result.summary, inputs, results: { values: result.values,
display: result.display, summary: result.summary, format_version }, narrative, tone, body }`, `saveAsExample`. `project_name` = value of the
first `text` field whose key is `project_name`, else first text field; `location` = field `location` if present else "".
After success: clear local draft, set `postId` (so re-saving updates), show "บันทึกแล้ว" with link "ดูโพสต์" (`#/post/<id>`) and "กลับคลังโพสต์".
Errors → Thai message with code; keep state.
Also allow saving from step 2 onward via a small text button "บันทึกเป็นร่าง" in the stepper area (post_status `draft`, no doc).

### T4 Data needed for the prompt (`web/js/prompt-data.js`)
`loadPromptContext(formatId, user)` → in parallel: `styledna.get {scope:'HOUSE'}`, `styledna.get {scope:user.user_id}`,
`examples.list {format_id, owner:'HOUSE'}` (take newest 1), `examples.list {format_id, owner:user.user_id}` (take newest 1), `auth.me` (fresh profile).
Each failure → that part null (never block). HOUSE DNA null → use `DEFAULT_HOUSE_DNA` from `web/js/prompt/house-default.js`:
```js
export const DEFAULT_HOUSE_DNA = {
  voice: 'เล่าเรื่องอสังหาฯ แบบเพื่อนเล่าให้เพื่อนฟัง อ่านง่าย มีอารมณ์ขันแต่ข้อมูลแน่น',
  number_rules: [
    'ใช้ตัวเลขตามที่ให้มาเท่านั้น ห้ามปัดเศษใหม่ ห้ามคำนวณเพิ่ม ห้ามสร้างตัวเลขใหม่',
    'เงินหลักล้านเขียนเป็น "ล้าน" ตามตัวเลขที่ให้ เช่น 996.8 ล้าน',
    'ตัวเลขของแต่ละ Case ต้องอยู่ใต้หัวข้อ Case นั้นเท่านั้น ห้ามสลับ Case'
  ],
  hashtags: ['#ที่ว่างๆไม่ใช่ที่ดินแต่เป็นแอดมินเอง','#ที่ว่างๆจะเป็นอะไรได้บ้าง','#อสังหาฯข้างบ้าน','#realestate','#bgts','#ที่ว่างว่าง'],
  do: [], dont: ['ห้ามใช้อีโมจิเกิน 3 ตัวทั้งโพสต์']
};
```
DNA object shape (also what P6 will store as `dna_json`): `{ voice, number_rules[], hashtags[], do[], dont[], signature_phrases[]? }` — personal DNA
uses `{ voice, do[], dont[], signature_phrases[] }`. Treat every property as optional.

### T5 Prompt builder (`web/js/prompt/build-write.js`, PURE, Node-testable)
`buildWritePrompt({ spec, result, inputs, narrative, tone, house, personal, profile, examples: { house, mine } }) -> string`
Playfulness captions (export `PLAYFULNESS`): 1 "จริงจัง ข้อมูลแน่น แทบไม่มีมุก"; 2 "สุภาพ เป็นกันเอง มุกเล็กน้อย"; 3 "เป็นกันเอง มีมุกพอประมาณ";
4 "ขี้เล่น ภาษาพูด มุกบ่อย"; 5 "ขี้เล่นสุด แซวได้เต็มที่ แต่ตัวเลขต้องเป๊ะ".
Output text, sections separated by a blank line, headings in `### `, exactly in this order (omit a section only where stated):
```
### บทบาท
คุณคือผู้ช่วยเขียนโพสต์ Facebook ภาษาไทยของเพจ "ที่ว่างว่าง" เขียนในนามของ <profile.display_name>
งานของคุณคือ "เล่าเรื่อง" จากตัวเลขที่คำนวณไว้แล้วเท่านั้น

### กฎตัวเลข (สำคัญที่สุด)
- ตัวเลขทุกตัวด้านล่างคำนวณแล้ว ห้ามแก้ ห้ามคำนวณใหม่ ห้ามปัดเศษใหม่ ห้ามเพิ่มตัวเลขที่ไม่มีในรายการ
- <each house.number_rules as "- ...">

### สไตล์ของเพจ (House Style)
<house.voice>
<"ควรทำ:" + bullets of house.do, only if non-empty>
<"ห้าม:" + bullets of house.dont, only if non-empty>

### สไตล์ของผู้เขียน (<display_name>)
<personal.voice if any>
ระดับความขี้เล่น: <n>/5 — <caption>
<"คำติดปาก: " + profile.catchphrases if non-empty, plus personal.signature_phrases joined ", ">
<"สิ่งที่ไม่ใช้: " + profile.avoid_list if non-empty, plus personal.dont>
<personal.do bullets if any>

### ตัวอย่างโพสต์ (ใช้ดูสำนวนเท่านั้น ห้ามลอกตัวเลขจากตัวอย่าง)
--- ตัวอย่างจากเพจ: <title> ---
<body>
--- ตัวอย่างของ <display_name>: <title> ---
<body>
(omit this whole section if both examples are null; omit a missing one)

### ข้อมูลโครงการ
<for each text field with a non-empty value: "<label>: <value>">

### ตัวเลขที่คำนวณแล้ว (ห้ามแก้ ห้ามคำนวณใหม่)
<for each number/rai_ngan_wa input field: "<label>: <raw value as entered>" ; rai_ngan_wa as "<rai>-<ngan>-<wa> ไร่">
<for each comps row: "Comps: <name> <price formatted with commas> บาท/ตร.ม.">
<for each result.global row: "<label>: <text>">
<for each case: "[<case label>]" then each row "- <label>: <text>">
สรุป: <result.summary>

### วัตถุดิบเล่าเรื่อง
<for each narrative field with non-empty text: "<label>: <text>">

### โครงเรื่อง (เขียนตามลำดับนี้ ไม่ต้องใส่หัวข้อช่วง)
1. <title> — <guide>
...

### คำสั่งเพิ่มเติม
<for each ticked tone option: "- <instruction>">
<if page_hashtags-like option is ticked (any option whose instruction mentions "hashtag"), append line "Hashtag ประจำเพจ: " + house.hashtags joined by space>
(omit section if none ticked)

### รูปแบบคำตอบ
ตอบเป็นข้อความโพสต์พร้อมโพสต์อย่างเดียว ภาษาไทย ไม่ต้องอธิบาย ไม่ต้องใช้ Markdown ไม่ต้องใส่หัวข้อ ###
เมื่อพูดถึงตัวเลขของแต่ละเคส ให้ขึ้นต้นช่วงนั้นด้วยชื่อเคส (<case labels joined " / ">) เพื่อให้ระบบตรวจตัวเลขได้
(the last line only if spec.cases non-empty)
```
Never output `undefined`, `null`, `[object Object]`, `NaN`. Trim trailing spaces; collapse 3+ blank lines to one blank line.

### T6 Post view (`#/post/:id`, `views/post-view.js`)
`posts.get` → header: project_name, location, author · format name (from `formats.list` cache or format_id) · status pill · Thai date.
Doc link if `doc_url` ("เปิด Google Doc"). Results via results-view using the stored `results` (render from stored `display`/`summary`;
if the spec is available re-run `compute(spec, inputs)` instead — prefer re-compute when the format version matches `results.format_version`).
Body in a `<pre>`-like wrapped block (white-space: pre-wrap) with "คัดลอกข้อความ" button. Owner: button "แก้ไข" → `#/edit/<id>` (wizard loads
from the post: inputs, narrative, tone, body; starts at step 4). Library cards already link here.

### T7 Spec loading + cache
`web/js/formats.js`: `getSpec(formatId)` → `formats.get` → `validateSpec`; cache spec JSON in localStorage `tww.cache.format.<id>` (with version) so
the wizard works offline after first load. Invalid spec → screen "รูปแบบนี้มีปัญหา: <first 3 errors>".

### T8 Housekeeping
- sw.js: bump `CACHE` to `tww-shell-v0.4.0`; add every new js file to precache (web-static test already enforces this). config APP_VERSION '0.4.0'.
- CSS: stepper, tables (numbers right-aligned `.num`), verdict pills, issue list, highlighted preview, sheet/modal for comps picker
  (focus trap not required; close button ≥ 44px), sticky action bar respecting safe-area.

### T9 Tests (Node, `.test.mjs`)
- `tests/web-prompt.test.mjs`: build KLOS prompt from `seed/formats/feasibility-3case.json` + `tests/fixtures/klos-inputs.json` +
  `compute`, narrative `{hook:'H1', gossip:'G1', audience:'A1', assumption_reasons:'R1'}`, tone `{playfulness:4, options:['loft_note','page_hashtags']}`,
  house = DEFAULT_HOUSE_DNA, personal null, profile `{display_name:'Bank', catchphrases:'จัดไป', avoid_list:'คำหยาบ'}`, examples
  `{house:{title:'KLOS',body:'BODY_H'}, mine:null}`. Assert: contains "ห้ามแก้ ห้ามคำนวณใหม่"; contains every per-case text
  (`318.98 ล้าน`, `357.25 ล้าน`, `408.29 ล้าน`, `-43.95 ล้าน`, `+37.38 ล้าน`, `+145.84 ล้าน`, `+11.4%`) and globals (`19,545 ตร.ม.`, `547.26 ล้าน`, `90.2k`);
  `318.98` appears after "[Case 1 · Low]" and before "[Case 2 · Mid]"; the 13 section titles appear in order; "4/5 — ขี้เล่น ภาษาพูด มุกบ่อย";
  all 6 hashtags; "BODY_H" present and "ตัวอย่างของ Bank" absent; H1/G1/A1/R1 present; no `undefined|null|NaN|[object Object]`;
  with `options:[]` there is no "### คำสั่งเพิ่มเติม" and no hashtag line.
- `tests/web-wizard-state.test.mjs`: `emptyState(spec, {playfulness_default:2})` → playfulness 2, case_table defaults `{low:{loft_pct:0},mid:{loft_pct:30},high:{loft_pct:70}}`,
  `loft_factor` default 1.4 present, `bonus_pct` 0; serialize/deserialize round-trip.
- Extend nothing in P0–P3 tests except what the precache rule requires. `npm test` 0 failures.

## 5. CONSTRAINTS
- Spec-driven only: grep check — UI files (`web/js/views/*.js`, `fields.js`, `results-view.js`, `checker-view.js`, `wizard*.js`) must not contain
  `feasibility`, `loft`, `gfa`, `nsa` (add this to tests/web-static.test.mjs).
- No innerHTML-family APIs, no emoji, no AI API calls (`fetch` only inside api.js; grep test: `fetch(` appears only in `web/js/api.js` and `web/sw.js`).
- Engine and gas untouched.

## 6. ACCEPTANCE CRITERIA
- [ ] AC1: `npm test` 0 failures incl. T9 tests and the new static greps.
- [ ] AC2: Routes in T1 work; wizard has the 5 steps with back-navigation and local autosave/resume.
- [ ] AC3: Step 1 renders all 5 field types from spec; comps picker + "เก็บเข้าคลัง" wired to comps.list/comps.add.
- [ ] AC4: Prompt matches T5 structure (tests) and copy + 3 AI links work (describe verification).
- [ ] AC5: Step 4 highlights mismatches, per-issue "แก้ให้" and "แก้ทั้งหมด" use engine autofix and re-check.
- [ ] AC6: Step 5 three save modes + saveAsExample + mismatch guard; payload exactly per T3.
- [ ] AC7: Post view shows results/body/doc link; owner can edit.

## 7. Delivery format
Write `docs/relay/P4-OUTPUT.md` starting with `<!-- PLAN-RELAY:REVIEW -->`: file list, `npm test` summary, SELF-CHECK per AC with evidence,
what was NOT verified in a browser, deviations/questions ("None" if none). Then reply with a 5-line report.
