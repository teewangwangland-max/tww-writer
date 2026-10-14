<!-- PLAN-RELAY:EXECUTE -->
# P6 Style DNA + Personal Layer + Example Library — Execution Plan

## Instructions for the AI reading this file
You are the executor. Follow every step literally. Do not work outside SCOPE. Never violate CONSTRAINTS.
If something is genuinely ambiguous, STOP and write the question in the OUTPUT file — do not invent product behaviour.

## 1. CONTEXT
Project root `C:\Users\LENOVO\1xClaude-Projects\tww-content-writer-hub`. Read first: `docs/API.md` (esp. users.updateProfile, examples.*, styledna.*),
`gas/Examples.gs`, `gas/StyleDna.gs`, `gas/Api.gs` (ROUTES), `gas/Db.gs`, `tests/api.test.js` + `tests/helpers/gas-mock.js`,
`web/js/router.js`, `views/wizard.js`, `views/format-extract.js` (copy-prompt + paste-back UI pattern), `prompt/build-write.js`, `prompt/house-default.js`
(DNA shape), `prompt-data.js`, `clipboard.js`, `spec-json.js` (`extractJson`), `css/app.css`, `sw.js`.
Two style layers:
- **House Style** (admin only edits): page voice, number rules, page hashtags, do/don't. Scope `HOUSE` in StyleDNA.
- **Personal Layer** (each user): playfulness default 1–5, catchphrases, avoid list (Users row via `users.updateProfile`) + a personal DNA
  (scope = user_id in StyleDNA) + their own example posts.
DNA object shape (already used by the write prompt): `{ voice, number_rules[], hashtags[], do[], dont[], signature_phrases[] }`; personal DNA uses
`{ voice, do[], dont[], signature_phrases[] }`. Every property optional.
StyleDNA is append-only versions (v1, v2…); "current" = max version; rollback = append a copy (`styledna.rollback`). Changelog text is required on save.
DNA updates use Copy-Prompt: the app builds a prompt summarising the style from new examples, the user pastes the AI's JSON answer back, the app shows
old vs new and saves a new version with a changelog that says what was learned from which post. **The app never calls an AI API.**
Example sources: posts saved with "เก็บเป็นตัวอย่างสอนสไตล์" (already), manual paste, single Google Doc import, admin whole-folder import.
The admin's old posts folder id (for the UI default only, NOT a secret): `12fdV8uZhCC69RY1jjaCnnUupY_gvDizG`.

## 2. GOAL
Screens `#/style` (my style: profile, my DNA with versions, my examples) and `#/style/house` (admin: House DNA with versions, House examples,
folder import), DNA update via Copy-Prompt with changelog + rollback, example management (add, import Doc, hide/show, change format,
promote to House), plus one small backend addition `examples.update` and `examples.list {include_hidden}`.

## 3. SCOPE / OUT OF SCOPE
- Do: T1–T8. Backend changes ONLY those in T2 (+ tests + API.md). No other gas changes.
- Do NOT: delete anything anywhere (hide = `active` FALSE); change engine or formats; call AI APIs; run clasp; commit; deploy.

## 4. TASKS

### T1 Files
```
gas/Examples.gs                 (edit: examples.update, include_hidden)
gas/Api.gs                      (edit: route examples.update auth user)
docs/API.md                     (edit)
web/js/views/style.js           #/style
web/js/views/style-house.js     #/style/house (admin)
web/js/style/dna-editor.js      shared: current DNA view, manual edit, history + rollback
web/js/style/dna-update.js      shared: copy-prompt update flow
web/js/style/examples-panel.js  shared: example list + add/import/hide/format/promote
web/js/prompt/build-dna.js      PURE prompt builder + parseDnaAnswer + diffDna
tests/api-examples-update.test.js
tests/web-dna.test.mjs
```
Router: `#/style` (replace placeholder), `#/style/house` (admin-only). Header link "สไตล์ของฉัน" stays; admins also get "House Style" link → `#/style/house`.

### T2 Backend
- `examples.list { format_id?, owner?, include_hidden? }`: `include_hidden:true` returns inactive rows too, but only for rows the caller may manage
  (owner == caller, or caller is admin); others still get only active rows. Each row includes `active` (boolean).
- NEW `examples.update { example_id, active?, format_id?, title? }` (auth user): example must exist (`NOT_FOUND`); caller must be its owner, or admin
  (any owner incl. HOUSE) else `FORBIDDEN`; `title` ≤ 200 non-empty if given; `format_id` string ≤ 100 (may be '' = ไม่ระบุ); `active` boolean.
  Updates only those columns of that row (updateRow_). Returns the updated example (`_row` stripped). Never deletes.
- `examples.add` already supports owner HOUSE for admin. "Promote to House" = client calls `examples.add {owner:'HOUSE', format_id, title, body}`
  BUT first checks `examples.list {owner:'HOUSE', format_id}` for an item whose `source_ref` equals the original example_id; to make that possible,
  extend `examples.add` to accept optional `source` (default 'manual') and `source_ref` (default '') — promote sends `source:'promoted', source_ref:<example_id>`.
- Tests (`tests/api-examples-update.test.js`, reuse helpers from api.test.js by copying the small boot/login helpers): owner hides own example → list without
  include_hidden excludes it, with include_hidden includes it with active false; other writer → FORBIDDEN; admin can update HOUSE and others' rows;
  NOT_FOUND; format change persists; promote flow stores source 'promoted' + source_ref; static: no deleteRow etc. still holds (existing test).

### T3 `#/style` screen (all users) — sections in this order
1. **ตั้งค่าสไตล์ส่วนตัว**: playfulness default (5 segmented buttons + caption from `PLAYFULNESS` in build-write.js), textarea "คำติดปาก" (one per line),
   textarea "สิ่งที่ไม่ใช้" (one per line), button "บันทึก" → `users.updateProfile` (store as the newline-joined string) → update `store` user.
2. **Style DNA ของฉัน** — `dna-editor` with scope = my user_id (T5) + `dna-update` (T6).
3. **คลังตัวอย่างของฉัน** — `examples-panel` with owner = my user_id (T7).

### T4 `#/style/house` (admin)
1. **House Style** — `dna-editor` scope `HOUSE`; when no version exists show `DEFAULT_HOUSE_DNA` as the starting content with a note
   "ยังไม่มีเวอร์ชันในระบบ — บันทึกครั้งแรกจะเป็น v1"; + `dna-update` scope HOUSE (examples source = HOUSE examples AND all users' active examples? NO: use HOUSE examples only).
2. **ตัวอย่างของเพจ (House)** — `examples-panel` owner `HOUSE`.
3. **ดูด Google Doc ทั้งโฟลเดอร์** — inputs: folder (URL or id; extract id with `/folders/([a-zA-Z0-9_-]{20,})/`, prefilled with the folder id from CONTEXT),
   format select (from `formats.list`, default the first published), owner select (from `users.list`, default me). Button "เริ่มดูด" → loop
   `examples.importFolder` while `remaining` is true (max 10 rounds), showing "นำเข้าแล้ว <sum imported> · ข้าม (ซ้ำ) <sum skipped>" live; errors in Thai
   (DOC_NOT_ACCESSIBLE / not found → "เปิดโฟลเดอร์ไม่ได้ — ตรวจว่าแชร์ให้ teewangwangland@gmail.com แล้ว").

### T5 `dna-editor.js` — `renderDnaEditor({ scope, isHouse, canEdit })`
- Loads `styledna.get` + `styledna.history`. Shows "เวอร์ชันปัจจุบัน v<n> · <date> · โดย <name>" and the DNA as readable sections: น้ำเสียง (voice),
  กฎตัวเลข (number_rules, House only), Hashtag ประจำเพจ (hashtags, House only), ควรทำ (do), ห้าม (dont), วลีประจำตัว (signature_phrases).
- "แก้เอง" (canEdit): form with textarea for voice and one-per-line textareas for each list (House shows number_rules + hashtags; personal hides them),
  required "บันทึกการเปลี่ยนแปลง (changelog)" input; save → `styledna.save {scope, dna, changelog, source_example_ids: []}`.
- "ประวัติเวอร์ชัน" list (newest first): v<n>, date, author, changelog (first 200 chars, expandable); for non-current versions a button "ย้อนกลับไปใช้ v<n>"
  with inline confirm ("จะสร้าง v<next> ที่เหมือน v<n> — ยืนยัน?") → `styledna.rollback`. After any save/rollback reload.

### T6 `dna-update.js` — Copy-Prompt update — `renderDnaUpdate({ scope, ownerForExamples, isHouse })`
Steps (inline, no separate route):
1. Pick examples: list active examples of `ownerForExamples` (`examples.list {owner}`) with checkboxes; examples whose id is in ANY version's
   `source_example_ids` are labelled "เคยใช้สอนแล้ว" and unchecked by default; others checked. Need ≥ 1 checked.
2. "คัดลอก prompt" → `buildDnaPrompt` (T8) + the 3 AI links (same as wizard) + collapsible preview.
3. Paste box "วางคำตอบจาก AI" → `parseDnaAnswer` → errors in Thai, or a diff view (`diffDna(current, proposed)`): per field show "เดิม" / "ใหม่" lists with
   added items marked "+", removed "−"; changelog preview built from the answer.
4. "บันทึกเป็นเวอร์ชันใหม่" → `styledna.save {scope, dna: proposed, changelog, source_example_ids: checked ids}`; success "บันทึก v<n> แล้ว" and the editor reloads.

### T7 `examples-panel.js` — `renderExamplesPanel({ owner, canManage, isAdmin })`
- Format filter select ("ทุกรูปแบบ" + formats). List via `examples.list {owner, format_id?, include_hidden: canManage}`: cards with title, format name (or
  "ไม่ระบุรูปแบบ"), source label (post "จากโพสต์", doc "จาก Google Doc", manual "พิมพ์เอง", promoted "ยกเป็นตัวอย่างของเพจ"), Thai date, first 160 chars,
  "อ่านทั้งหมด" toggles full body (pre-wrap). Hidden ones dimmed with pill "ซ่อนอยู่".
- canManage actions per card: "ซ่อน"/"แสดง" (`examples.update {active}`), format select "เปลี่ยนรูปแบบ" (`examples.update {format_id}`); admin on non-HOUSE panels:
  "ใช้เป็นตัวอย่างของเพจ" (promote per T2; if already promoted show "เป็นตัวอย่างของเพจแล้ว").
- Add area (canManage): (a) "ดึงจาก Google Doc": input URL + format select → `examples.importDoc {doc, format_id, owner}`; duplicate → "มีตัวอย่างนี้แล้ว";
  (b) "เพิ่มเอง": title + body textarea + format → `examples.add`.

### T8 `build-dna.js` (PURE, Node-testable)
- `buildDnaPrompt({ scope, isHouse, displayName, currentDna, examples: [{example_id, title, body}] }) -> string`, headings `### `:
  `### บทบาท` ("คุณคือบรรณาธิการที่สรุปสไตล์การเขียนโพสต์ Facebook ภาษาไทย" + whose style: "ของเพจ ที่ว่างว่าง" or "ของ <displayName>"),
  `### สไตล์ปัจจุบัน` (JSON of currentDna pretty, or "ยังไม่มี"), `### โพสต์ตัวอย่างใหม่` (each as `--- [<example_id>] <title> ---` + body),
  `### สิ่งที่ต้องทำ` (bullets: keep what still holds, add what the new posts show, remove only what clearly contradicts them; NEVER put numbers/facts of a specific
  project into the DNA; House keeps `number_rules` and `hashtags` unless the posts clearly change them; personal DNA has no number_rules/hashtags),
  `### รูปแบบคำตอบ` — answer ONE ```json block: `{ "dna": { ...fields... }, "changelog": [ { "example_id": "...", "learned": "..." } ] }` with the allowed fields listed
  (House: voice, number_rules, hashtags, do, dont, signature_phrases; personal: voice, do, dont, signature_phrases).
- `parseDnaAnswer(text, { isHouse }) -> { ok, dna, changelogText, learned: [...] } | { ok:false, error }` using `extractJson`; keep only allowed fields; lists must be
  arrays of non-empty strings (trimmed, deduped, ≤ 30 items each, each ≤ 300 chars); voice string ≤ 1000; `changelog` array required non-empty;
  `changelogText` = lines `- <example title or id>: <learned>` (titles resolved by caller-provided map is optional; ids are fine).
- `diffDna(oldDna, newDna) -> [{ field, added:[], removed:[], changed: bool }]` (voice: changed when strings differ).
- Tests `web-dna.test.mjs`: prompt contains headings in order, both example ids/bodies, "ห้าม" rule about project numbers; personal prompt omits number_rules/hashtags
  in the allowed list; parseDnaAnswer happy path (fenced JSON) → dna + changelogText containing the example id; drops unknown fields and personal number_rules;
  missing changelog → error; non-array list → error; diffDna detects added/removed items and voice change.

### T9 Housekeeping
sw `tww-shell-v0.6.0` + precache new files; `APP_VERSION` `0.6.0`; CSS for diff (added = `#4F6128` text with "+", removed = `#B3261E` with "−" — never rely on
color alone), version list, dimmed hidden cards. Update `docs/API.md` for T2.

## 5. CONSTRAINTS
- No deletes anywhere; hide uses `active`. StyleDNA append-only (existing API).
- No innerHTML family, no emoji, controls ≥ 44px, `fetch` only in api.js/sw.js, no AI API calls.
- UI must not contain format-specific words (existing web-static test).
- All previous tests stay green; `npm test` 0 failures.

## 6. ACCEPTANCE CRITERIA
- [ ] AC1: `npm test` 0 failures incl. T2 and T8 tests.
- [ ] AC2: `#/style` profile save works via users.updateProfile; DNA editor shows current version, manual edit saves v+1 with required changelog, history + rollback.
- [ ] AC3: DNA Copy-Prompt update: pick examples (already-used marked), copy prompt, paste answer, diff, save with changelog + source_example_ids.
- [ ] AC4: Examples panel: list (incl. hidden for owner/admin), hide/show, change format, import Doc, manual add, admin promote-to-House with dedupe.
- [ ] AC5: `#/style/house` admin-only, House DNA starts from DEFAULT_HOUSE_DNA when empty, folder import loop with live counts and Thai errors.
- [ ] AC6: Backend change limited to T2, documented in API.md, no delete calls.

## 7. Delivery format
Write `docs/relay/P6-OUTPUT.md` starting with `<!-- PLAN-RELAY:REVIEW -->`: file list, `npm test` summary, SELF-CHECK per AC with evidence, what was NOT verified in a
browser, the exact `git diff --stat -- gas/` style summary of backend changes, deviations/questions ("None" if none). Then reply with a 5-line report.
