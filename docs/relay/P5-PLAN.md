<!-- PLAN-RELAY:EXECUTE -->
# P5 Format Extractor (admin) + Format #2 — Execution Plan

## Instructions for the AI reading this file
You are the executor. Follow every step literally. Do not work outside SCOPE. Never violate CONSTRAINTS.
If something is genuinely ambiguous, STOP and write the question in the OUTPUT file — do not invent product behaviour.

## 1. CONTEXT
Project root `C:\Users\LENOVO\1xClaude-Projects\tww-content-writer-hub`. Read first: `web/js/router.js`, `views/wizard.js`,
`views/pick-format.js`, `fields.js` (`renderFields`), `results-view.js`, `checker-view.js`, `wizard-state.js`, `formats.js`, `prompt/build-write.js`,
`clipboard.js`, `css/app.css`, `sw.js`, `web/js/engine/*` (spec schema is documented at the top of `docs/relay/P1-PLAN.md` T4), `docs/API.md`
(`formats.list/get/save`, `examples.add`), `seed/formats/feasibility-3case.json`.
A "format" = JSON spec stored in the Formats sheet (append-only versions; `formats.save {spec, status:'draft'|'published'}` is admin-only;
admins see drafts in `formats.list`). The whole write flow renders from the spec, so a new format must need NO code change.
The app never calls an AI API: the extractor builds a prompt, the admin pastes it into their own AI, then pastes the JSON answer back.
Design rules as before (colors, fonts, no emoji, ≥44px controls, `h()` only — no innerHTML family).

## 2. GOAL
Admin page `#/admin/formats`: list formats with publish/unpublish; "ถอดรูปแบบใหม่" flow: paste source post → name/id → copy extraction prompt
→ paste spec JSON → validate → preview (form, formulas, cases, sections, checks) → test formulas against the source post numbers → save as draft
or publish (optionally storing the source post as a HOUSE example). Also "แก้สเปก" for an existing format. Plus a second real format spec
(Rental Yield) with tests proving it works end-to-end through the engine without code changes.

## 3. SCOPE / OUT OF SCOPE
- Do: files in T1, the small engine extension in T7, tests, sw precache + version bump.
- Do NOT: change `gas/`; change the Feasibility spec; touch Style DNA; call AI APIs; commit; deploy; add deps.

## 4. TASKS

### T1 Files
```
web/js/views/admin-formats.js      list + entry points
web/js/views/format-extract.js     the 5-step extractor (also used for "แก้สเปก")
web/js/prompt/build-extract.js     PURE extraction-prompt builder
web/js/prompt/spec-schema-doc.js   PURE: export const SPEC_SCHEMA_DOC (string)
web/js/spec-json.js                PURE: extractJson(text), suggestFormatId(date, rand)
seed/formats/rental-yield.json     format #2 (T6)
tests/fixtures/rental-yield-post.txt
tests/web-extract.test.mjs
tests/engine-format2.test.mjs
```
Router: replace the `#/admin/formats` placeholder with `admin-formats.js`; add `#/admin/formats/new` and `#/admin/formats/edit/:id` (both admin-only)
→ `format-extract.js`. `pick-format.js`: for admins, drafts are listed with a pill "ร่าง".

### T2 Admin list (`#/admin/formats`)
`formats.list` → cards: name, `format_id` (mono), version "v<n>", status pill ("ใช้งาน" for published, "ร่าง" for draft). Per card buttons:
"แก้สเปก" → `#/admin/formats/edit/<id>`; "เปิดให้ทุกคนใช้" (if draft) / "ซ่อนเป็นร่าง" (if published) → `formats.get` that format, then
`formats.save {spec, status}` (this appends a new version — say so in the confirm text: "จะบันทึกเป็นเวอร์ชันใหม่ v<n+1> สถานะ <..> ยืนยัน?" inline ใช่/ไม่).
Top button "ถอดรูปแบบใหม่" → `#/admin/formats/new`.

### T3 Extractor flow (`format-extract.js`), stepper "1 โพสต์ต้นแบบ · 2 prompt · 3 วางสเปก · 4 ทดสอบ · 5 บันทึก"; autosave to localStorage `tww.extract.draft` (new) /
`tww.extract.edit.<id>` (edit), with resume bar like the wizard.
1. **โพสต์ต้นแบบ**: textarea "วางโพสต์ต้นแบบ" (required), input "ชื่อรูปแบบ" (required), input "รหัสรูปแบบ (id)" prefilled `suggestFormatId(new Date(), random)`
   = `fmt-YYYYMMDD-xxxx` (4 lowercase base36 chars); validate `^[a-z0-9][a-z0-9-]*$`, inline error "ใช้ได้แค่ a-z 0-9 และ -".
   If the id equals an existing format id (from `formats.list`) show "มีรูปแบบรหัสนี้แล้ว — บันทึกจะเป็นเวอร์ชันใหม่ของรูปแบบเดิม".
   In edit mode step 1 is prefilled: name/id from the format, source post from the newest HOUSE example of that format (`examples.list {format_id, owner:'HOUSE'}`), may be empty.
2. **prompt**: "คัดลอก prompt" (T4) + the same three AI links as the write wizard (Gemini/Claude/ChatGPT) + collapsible preview. In edit mode, also show a
   button "ข้ามไปแก้ JSON เอง" that puts the current spec (pretty JSON, 2 spaces) into step 3.
3. **วางสเปก**: textarea "วาง JSON ที่ได้จาก AI" (monospace). On change (debounce 500 ms): `extractJson` → if parse error show "อ่าน JSON ไม่ได้: <msg>";
   else force `spec.id` = the id from step 1 and `spec.name` = the name from step 1 (show a note if the AI's values differed), then `validateSpec`.
   Show errors (red list) and warnings (ink list). When valid show PREVIEW sections:
   - "ช่องกรอก": the real form via `renderFields` (inputs live, used for testing in step 4), prefilled from `spec.sample_inputs` (if present).
   - "สูตร": table key | label | expr (mono) | format type/dp | per_case.
   - "เคส": list id · label · markers · inputs (or "ไม่มีเคส").
   - "โครงเรื่อง": ordered list title — guide. "ตัวตรวจเลข": key + keywords. "โทนเสริม" and "ข้อสังเกต" lists.
4. **ทดสอบ**: `compute(spec, normalizeInputs(spec, inputsFromForm))` → `renderResults`; then `checkPost(sourcePost, spec, result, inputs)` → headline
   "สูตรตรงกับโพสต์ต้นแบบ <ok> จาก <checked> จุด" (+ mismatch/missing/unverified counts) and the read-only highlighted source + issue list
   (reuse checker-view's `buildSegments`; no autofix buttons here — the source post is the truth being tested, so instead show
   "โพสต์เขียน <raw> สูตรได้ <expectedText>"). Compute errors listed in Thai with the formula key.
5. **บันทึก**: checkbox "เก็บโพสต์ต้นแบบเป็นตัวอย่างของเพจ" (default ON for new, OFF for edit); buttons "บันทึกเป็นร่าง" and "เปิดให้ทุกคนใช้".
   Enabled only when validation has 0 errors. The saved spec = the validated spec INCLUDING `sample_inputs` = current test form inputs.
   `formats.save {spec, status}`; then if checkbox → `examples.add {owner:'HOUSE', format_id: spec.id, title: spec.name, body: sourcePost}`.
   Success: "บันทึกแล้ว v<version>" + links "ไปหน้ารูปแบบ" (`#/admin/formats`) and "ลองเขียนโพสต์ด้วยรูปแบบนี้" (`#/new/<id>`); clear the draft.

### T4 `build-extract.js` — `buildExtractPrompt({ name, formatId, sourcePost, exampleSpec, schemaDoc }) -> string`
Sections (headings `### `, this order):
- `### บทบาท` — "คุณคือผู้ช่วยถอดโครงสร้างโพสต์วิเคราะห์อสังหาฯ ให้เป็นสเปก JSON สำหรับแอปที่คำนวณตัวเลขด้วยโค้ด"
- `### หน้าที่` — bullets: extract every INPUT number the author assumed (→ fields), every DERIVED number (→ formulas reproducing the post's arithmetic,
  using round() where the post shows rounded intermediate values), the comparison cases if any (→ cases + one case_table), the story outline section by
  section (→ sections, Thai titles + one-line guide), the numbers that must be verified later (→ checks, keywords = the word(s) that appear in the post
  right BEFORE that number on the same line), optional tone checkboxes (→ tone_options) and notes; also `sample_inputs` = the input values found in the post
  (same shape as the app's inputs: number fields as numbers, rai_ngan_wa as "r-n-w" string, comps_table as [{name, price_per_sqm}], case_table as {caseId:{col:value}}).
- `### กติกาของสเปก` — the full `SPEC_SCHEMA_DOC`.
- `### ตัวอย่างสเปกที่ใช้งานได้จริง` — "```json" + `JSON.stringify(exampleSpec, null, 2)` + "```" (omit section if exampleSpec null).
- `### ข้อมูลรูปแบบใหม่` — `ชื่อรูปแบบ: <name>` and `id: <formatId>`.
- `### โพสต์ต้นแบบ` — the source post verbatim between lines `<<<โพสต์` and `โพสต์>>>`.
- `### รูปแบบคำตอบ` — "ตอบเป็น JSON object เดียวในบล็อก ```json เท่านั้น ห้ามมีคำอธิบายนอกบล็อก ใช้ schema_version 1 และ id/name ตามที่ให้ไว้ ต้องมี sample_inputs".
No `undefined`/`null`/`[object Object]` in output.
`SPEC_SCHEMA_DOC` (Thai/English mix is fine, ≤ 120 lines) must state precisely: top-level keys (required: schema_version, id, name, fields, formulas, sections, checks;
optional: description, cases, summary, notes, narrative_fields, tone_options, sample_inputs); field types `number|text|rai_ngan_wa|comps_table|case_table` and the
variables each exposes (`<key>`, `<key>_rai/_ngan/_wa`, `<key>_count/_avg/_min/_max`, case_table columns only inside per_case formulas); key regex
`^[a-z][a-z0-9_]*$`; formula objects (global vs `per_case:true`, results referenced as `<caseId>.<key>` from later globals; `{module,args,into}` form exists
but must NOT be used unless told); expression grammar: numbers, + - * / % ^, comparisons, && || !, parentheses, strings in double quotes, functions ONLY
`round(x,dp) floor ceil abs min max sum avg if(cond,a,b)`; no commas inside numbers; percentages are entered as whole numbers so divide by 100;
format types `int|number|million|thousand|percent|text` with `dp`, `signed`, `suffix`; `summary`: `{per_case_key}` for formats with cases or `{key}` for a
global verdict (T7); narrative_fields default to the 4 standard ones (hook "มุม Hook", gossip "ข่าว/ซุบซิบโครงการ", audience "กลุ่มลูกค้า/บริบทตลาด",
assumption_reasons "เหตุผลของสมมติฐาน") unless the post clearly needs others; checks rules (keywords appear BEFORE the number, same line, per_case only for
per-case formulas, cases need `markers` = the exact words the post uses to start each case section).

### T5 `spec-json.js`
- `extractJson(text)` → `{ ok:true, value }` or `{ ok:false, error }`: prefer the content of the first ```json … ``` (or ``` … ```) fence; else the substring from
  the first `{` to the last `}`; `JSON.parse`; value must be a plain object else error "ต้องเป็น JSON object". Strip a UTF-8 BOM and smart quotes “ ” → " only
  OUTSIDE of string literals is NOT required — just try JSON.parse as-is first, and if it fails retry once after replacing “ ” with ".
- `suggestFormatId(date, rand)` → `fmt-YYYYMMDD-xxxx` (date in Asia/Bangkok, i.e. +7 h).

### T6 Format #2 — `seed/formats/rental-yield.json` (write exactly this content model)
`schema_version 1`, id `rental-yield`, name `"Rental Yield คอนโด"`, description `"คอนโดซื้อปล่อยเช่า คุ้มไหม ดู yield และระยะคืนทุน"`, `cases: []`, `summary: { "key": "verdict" }`.
fields: `project_name` text "ชื่อโครงการ" required; `location` text "ทำเล"; `unit_price` number "ราคาซื้อ" unit "บาท" required; `size_sqm` number "ขนาดห้อง" unit "ตร.ม."
required; `rent_month` number "ค่าเช่า/เดือน" unit "บาท" required; `common_fee_sqm` number "ค่าส่วนกลาง/ตร.ม./เดือน" unit "บาท" default 0; `vacancy_months` number
"เดือนที่ห้องว่างต่อปี" default 1.
formulas (all global):
| key | label | expr | format |
|---|---|---|---|
| price_sqm | ราคาต่อตร.ม. | `unit_price/size_sqm` | int suffix " บาท/ตร.ม." |
| rent_year | ค่าเช่าต่อปี | `rent_month*(12-vacancy_months)` | int " บาท" |
| common_year | ค่าส่วนกลางต่อปี | `common_fee_sqm*size_sqm*12` | int " บาท" |
| net_year | รายได้สุทธิต่อปี | `rent_year - common_year` | int " บาท" |
| gross_yield | Gross yield | `rent_month*12/unit_price*100` | percent dp2 "%" |
| net_yield | Net yield | `net_year/unit_price*100` | percent dp2 "%" |
| payback_years | ระยะคืนทุน | `unit_price/net_year` | number dp1 " ปี" |
| verdict | สรุป | `if(net_yield >= 5, "คุ้ม", if(net_yield >= 3, "รอด", "ไม่รอด"))` | text |
notes: `["yield นี้ยังไม่หักภาษีและค่าซ่อมแซม"]`. narrative_fields = the 4 standard ones. tone_options: `page_hashtags` "hashtag ประจำเพจ" /
"ใส่ hashtag ประจำเพจจาก House Style ไว้ท้ายโพสต์". sections s1..s6: "Hook" / "แนะนำโครงการและทำเล" / "สมมติฐานค่าเช่าและค่าใช้จ่าย" / "คำนวณ yield" /
"สรุปคุ้มไหม" / "CTA และ hashtag" (guide = one Thai sentence each).
checks (global): `price_sqm` ["ตกตารางเมตรละ"]; `rent_year` ["ค่าเช่าปีละ"]; `common_year` ["ส่วนกลาง"]; `net_year` ["สุทธิ"]; `gross_yield` ["Gross yield"];
`net_yield` ["Net yield"]; `payback_years` ["คืนทุน"].
`sample_inputs`: `{ "project_name":"คอนโดตัวอย่าง", "location":"อารีย์", "unit_price":3500000, "size_sqm":35, "rent_month":15000, "common_fee_sqm":60, "vacancy_months":1 }`.
`tests/fixtures/rental-yield-post.txt` (exact, LF):
```
คอนโดใกล้ BTS อารีย์ ห้อง 35 ตร.ม. ราคา 3.5 ล้าน ตกตารางเมตรละ 100,000 บาท
ปล่อยเช่าเดือนละ 15,000 บาท เผื่อห้องว่าง 1 เดือน ได้ค่าเช่าปีละ 165,000 บาท
ค่าส่วนกลาง 60 บาท/ตร.ม. ปีละ 25,200 บาท เหลือสุทธิ 139,800 บาท
Gross yield 5.14% Net yield 3.99% คืนทุนประมาณ 25 ปี สรุปว่ารอด
```

### T7 Engine extension (the ONLY engine change allowed)
`spec.summary` may be `{ key }` (global formula key) instead of `{ per_case_key }`: then `result.summary` = that formula's display text (e.g. `"รอด"`).
`validateSpec`: `summary.key` must reference an existing global formula; `summary.per_case_key` must reference a per-case formula (keep existing behaviour).
Feasibility behaviour must not change (all existing tests stay green, unmodified).

### T8 Tests
- `engine-format2.test.mjs`: rental-yield spec validates with 0 errors; `compute(spec, spec.sample_inputs)` → formatted: price_sqm `100,000`, rent_year `165,000`,
  common_year `25,200`, net_year `139,800`, gross_yield `5.14`, net_yield `3.99`, payback_years `25`, verdict `รอด`, summary `"รอด"`;
  `checkPost(fixture, spec, result, inputs)` → stats.mismatch 0, missing 0, and every one of the 7 checks counted ok (stats.ok === 7);
  replacing `Net yield 3.99%` with `Net yield 4.99%` → exactly one mismatch with checkKey `net_yield` and autofix restores `3.99%`;
  summary `{key:'nope'}` → validation error mentioning `nope`.
- `web-extract.test.mjs`: `extractJson` cases — fenced ```json block with prose around; bare object with prose; smart-quote JSON; array → error; garbage → error.
  `suggestFormatId(new Date('2026-10-13T20:00:00Z'), 'ab12')` → `fmt-20261014-ab12`. `buildExtractPrompt` with the Feasibility spec as example, name "ทดสอบ", id
  "fmt-x", source "โพสต์ ABC 123": contains every `###` heading in order, the source between the markers, `"sample_inputs"`, "round(x,dp)", the example spec's
  `"feasibility-3case"`, no `undefined|null|[object Object]`; with `exampleSpec:null` the example section is absent.
- web-static greps still pass (spec-driven rule: the new UI files must not contain `feasibility`, `loft`, `gfa`, `nsa`, `rental`, `yield`).

### T9 Housekeeping
sw.js cache `tww-shell-v0.5.0` + precache new files; `APP_VERSION` `0.5.0`; CSS for monospace JSON textarea (`font-family: IBM Plex Mono`, 14px allowed here),
preview tables, error lists.

## 5. CONSTRAINTS
- UI stays spec-driven (no format-specific code). No innerHTML family, no emoji, no AI API calls (fetch only in api.js/sw.js).
- Only the T7 engine change; Feasibility spec/tests untouched; `gas/` untouched.
- Saving never deletes or overwrites: formats are append-only by the API already; examples.add appends.

## 6. ACCEPTANCE CRITERIA
- [ ] AC1: `npm test` 0 failures incl. all T8 tests.
- [ ] AC2: Admin list with publish/unpublish (new version) and admin-only routes; drafts visible to admin in the picker with "ร่าง".
- [ ] AC3: Extractor 5 steps per T3 incl. autosave/resume, validation errors, full preview, test-against-source report, save draft/publish + optional HOUSE example.
- [ ] AC4: Extraction prompt per T4 (tests) and SPEC_SCHEMA_DOC covers every rule listed.
- [ ] AC5: Rental Yield spec works through the unchanged UI path: validated, computed, checked (tests) — no code mentions it outside seed/tests.
- [ ] AC6: T7 engine extension done with validation; all Feasibility tests unchanged and green.

## 7. Delivery format
Write `docs/relay/P5-OUTPUT.md` starting with `<!-- PLAN-RELAY:REVIEW -->`: file list, `npm test` summary, SELF-CHECK per AC with evidence, what was NOT verified
in a browser, deviations/questions ("None" if none). Then reply with a 5-line report.
