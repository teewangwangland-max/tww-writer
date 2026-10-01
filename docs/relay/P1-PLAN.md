<!-- PLAN-RELAY:EXECUTE -->
# P1 Calc Engine + Number Checker + Feasibility Spec — Execution Plan

## Instructions for the AI reading this file
You are the executor of this plan. Follow every step literally. Do not work outside SCOPE. Never violate CONSTRAINTS.
If something is genuinely ambiguous, STOP and write the question in the OUTPUT file — do not invent product behaviour.
When finished, write the OUTPUT file described in section 7.

## 1. CONTEXT
Project root: `C:\Users\LENOVO\1xClaude-Projects\tww-content-writer-hub`. P0 already created `gas/`, `web/`, `tests/`,
`package.json` (script `"test": "node --test tests/*.test.js"`), zero npm dependencies. Node 24.

The app: friends write Thai real-estate feasibility posts. **Every number is computed by code**; an AI (used manually by the
user, never called by the app) only narrates. A "Format" is a JSON spec (fields, formulas, cases, sections, checks...) so new
post formats can be added with no code changes. This phase builds the pure-JS engine the browser will use:
1. a safe expression evaluator (NO `eval`, NO `new Function`),
2. spec validator,
3. calculator that runs a spec over user inputs,
4. number display formatter,
5. a Thai-text number scanner that compares numbers in an AI-written post against computed results, flags mismatches, auto-fixes,
6. the first real Format spec "Feasibility 3 เคส", with golden test data (KLOS Bangkae) that must match EXACTLY.

## 2. GOAL
`web/js/engine/*.js` ES modules + `seed/formats/feasibility-3case.json` + tests, such that `npm test` proves: KLOS numbers match
to the displayed digit, the swapped GP in Case 1 is flagged and auto-fixed, and malicious formulas are rejected.

## 3. SCOPE / OUT OF SCOPE
- Do: files listed in T0; update `package.json` test script (T9); tests.
- Do NOT: touch `gas/`; build any UI; prompt builder; network calls; add npm dependencies; commit; run clasp.

## 4. TASKS

### T0 Files
```
web/package.json                 {"type":"module","private":true}   (web/**/*.js = ESM in Node; browser uses <script type="module">)
web/js/engine/expr.js            tokenizer + parser (AST) + evaluator
web/js/engine/format.js          display formatting + roundHalfUp
web/js/engine/modules.js         named special-module registry
web/js/engine/spec.js            validateSpec
web/js/engine/calc.js            compute
web/js/engine/numscan.js         scanNumbers, checkPost, autofix
web/js/engine/index.js           re-exports everything
seed/formats/feasibility-3case.json
tests/fixtures/klos-inputs.json
tests/fixtures/klos-post-swapped.txt     (exact text in T8)
tests/engine-expr.test.mjs
tests/engine-calc.test.mjs
tests/engine-numscan.test.mjs
tests/engine-spec.test.mjs
```
All engine files: plain ESM, `export function ...`, relative imports between themselves only, no browser globals, no Node APIs.

### T1 `expr.js` — safe expression language
Exports: `parse(src) -> AST`, `evaluate(ast, scope) -> value`, `identifiersOf(ast) -> string[]`, `evalExpr(src, scope)`, `ExprError`.
Grammar (recursive descent, precedence low→high):
```
expr    := or
or      := and ( '||' and )*
and     := cmp ( '&&' cmp )*
cmp     := add ( ('<'|'<='|'>'|'>='|'=='|'!=') add )?
add     := mul ( ('+'|'-') mul )*
mul     := unary ( ('*'|'/'|'%') unary )*
unary   := ('-'|'+'|'!') unary | pow
pow     := primary ( '^' unary )?          (right-assoc; so -2^2 = -4 and 2^3^2 = 512)
primary := NUMBER | STRING | IDENT | FUNCNAME '(' args ')' | '(' expr ')'
IDENT   := [A-Za-z_][A-Za-z0-9_]* ( '.' [A-Za-z_][A-Za-z0-9_]* )?      (at most one dot, e.g. low.pv)
NUMBER  := digits with optional '.' fraction (no commas, no exponent)
STRING  := "..." (double quotes, may contain Thai; only escape supported is \" )
Whitespace (space, tab, newline) ignored.
```
- Whitelisted functions only: `round(x, dp=0)` (uses format.roundHalfUp), `floor`, `ceil`, `abs`, `min(...)`, `max(...)`,
  `if(cond, a, b)` (lazy: evaluate only the chosen branch), `sum(...)`, `avg(...)`. A call to any other name → `UNKNOWN_FUNC`.
- Identifier segments `__proto__`, `constructor`, `prototype` rejected at parse time → `code:'FORBIDDEN_IDENT'`.
- Scope lookup via `Object.prototype.hasOwnProperty.call(scope, name)` with the full dotted name as key (`scope["low.pv"]`).
  Unknown → `ExprError code:'UNKNOWN_IDENT'`, `.ident = name`.
- Division/modulo by zero → `DIV_ZERO`. Non-finite numeric result → `NOT_FINITE`.
- Limits: source length > 500 chars or AST depth > 50 → `TOO_COMPLEX`. Any other unexpected char/token → `SYNTAX` with `.pos`.
- `class ExprError extends Error` with fields `code`, `pos?`, `ident?`.

### T2 `format.js`
Exports `roundHalfUp(x, dp)`, `formatValue(value, fmt)`, `formatNumberPart(value, fmt)`, `scaleOf(fmt)`.
- `roundHalfUp(x, dp)`: round half away from zero, robust to float error:
  `const f = 10**dp; return Math.sign(x) * Math.round(Math.abs(x) * f * (1 + 1e-12) + 1e-9) / f;`
- `fmt` = `{ type, dp, trim, signed, suffix }`, defaults `dp:0, trim:true, signed:false, suffix:''`.
- `scaleOf(fmt)`: million → 1e6, thousand → 1e3, else 1.
- `formatNumberPart`: v' = v / scaleOf(fmt); round to dp (int → dp 0); thousands commas on integer part; if `trim` remove trailing
  zeros and a dangling `.`; `signed:true` → prefix `+` when rounded value > 0; negatives use ASCII `-`; zero has no sign.
  `text` type → `String(v)`.
  Examples: int 19545.12 → `19,545`; number dp1 2326.8 → `2,326.8`; million dp2 996800000 → `996.8`; million dp2 547260000 → `547.26`;
  thousand dp1 90200 → `90.2`; percent dp1 signed -4.4088 → `-4.4`; million dp2 signed 37382000 → `+37.38`.
- `formatValue` = `formatNumberPart` + `fmt.suffix`.

### T3 `modules.js`
`registerModule(name, fn)`, `getModule(name)`, `listModules()`, `clearModules()` (for tests). `fn(args, scope)` returns a plain object
of numbers. Module-level `Map`. Nothing registered by default.

### T4 Spec schema + `spec.js` → `validateSpec(spec) -> { ok, errors:[string], warnings:[string] }`
```jsonc
{
  "schema_version": 1,
  "id": "kebab-case-id", "name": "display name", "description": "optional",
  "fields": [ Field ],
  "cases": [ { "id": "low", "label": "Case 1 · Low", "markers": ["Case 1","เคส 1"], "inputs": { "loft_pct": 0 } } ],   // optional, may be []
  "formulas": [ Formula ],
  "summary": { "per_case_key": "status" },            // optional; card summary = "<case label> <text>" joined " · "
  "notes": [ "string shown under results" ],
  "narrative_fields": [ { "key": "hook", "label": "มุม Hook", "hint": "optional" } ],
  "tone_options": [ { "key": "loft_note", "label": "ใส่โน้ตอธิบาย Loft", "instruction": "text inserted into the prompt when ticked" } ],
  "sections": [ { "id": "s1", "title": "...", "guide": "..." } ],
  "checks": [ Check ]
}
```
Field: `{ key, label, type, required?, unit?, default?, hint? }`, `type` ∈
- `number` → exposes var `<key>`.
- `text` → not usable in formulas (validator error if referenced).
- `rai_ngan_wa` → exposes `<key>_rai`, `<key>_ngan`, `<key>_wa`. Input `{rai, ngan, wa}` or string `"1-1-81.7"`.
- `comps_table` → input `[{ name, price_per_sqm }]`; exposes `<key>_count`, `<key>_avg`, `<key>_min`, `<key>_max` over price_per_sqm (0 rows → all 0).
- `case_table` → at most one; `columns: [{ key, label, unit? }]`; input `{ <caseId>: { <colKey>: number } }`, missing values default from
  `cases[].inputs`. Column vars visible ONLY inside per-case formulas, unqualified.

Formula — one of:
- `{ key, label, expr, format, per_case?: false, show?: true }` — global, evaluated once, in list order.
- `{ key, label, expr, format, per_case: true, show? }` — evaluated for every case; stored as `<caseId>.<key>`. Inside a per-case expr:
  globals defined earlier, that case's columns, and earlier per-case keys of the SAME case (unqualified) are visible.
- `{ module: "name", args: {…literal numbers/strings…}, into: "prefix" }` — calls registered module; each returned key `k` becomes global `<prefix>_<k>`.
Global formulas listed after per-case ones may reference `<caseId>.<key>`.

Check: `{ key, keywords: [string], per_case?: boolean }` — `key` must be a formula key whose `per_case` equals the check's.

Validator errors (readable English, name the offending item): missing top-level `schema_version`, `id`, `name`, `fields`, `formulas`,
`sections`, `checks`; unknown field type; duplicate keys across fields/formulas; key not matching `^[a-z][a-z0-9_]*$`;
expr parse failure (include ExprError code); expr references an identifier not visible at that point (static check via
`identifiersOf`, using the visibility rules; module outputs are unknown statically → treat `<into>_*` as visible after the module
entry); reference to a `text` field; unknown module name; check references unknown formula or per_case mismatch; >1 case_table;
case_table with empty `cases`; unknown `format.type` (allowed: int, number, million, thousand, percent, text).
Warnings: `sections` empty; check on a formula with `show:false`.

### T5 `calc.js` — `compute(spec, inputs) -> result`
```
result = {
  ok: boolean, errors: [ { key, caseId?, code, message } ],
  values:  { "<var>": v, "<caseId>.<key>": v, ... },   // exposed input vars + all formula results
  display: { same keys as formula results → formatValue string (with suffix) },
  global: [ { key, label, value, text } ],              // global formulas with show !== false, in order
  cases:  [ { id, label, rows: [ { key, label, value, text } ] } ],   // per-case formulas with show !== false
  summary: "Case 1 · Low ไม่รอด · Case 2 · Mid รอด · Case 3 · High คุ้ม"   // "" when spec has no summary
}
```
Number inputs may be strings with commas (`"300,000"`) → parse. Required field missing/empty → error `MISSING_INPUT` (key = field key).
Formula that cannot evaluate because a needed var is missing/errored → `DEPENDENCY`; other ExprErrors → their code. Keep computing
everything else. Optional number field missing → use `default` if present, else it's missing (DEPENDENCY if referenced).

### T6 `numscan.js`
**`scanNumbers(text, { markers = [] } = {}) -> Token[]`**, Token = `{ start, end, raw, value, decimals, multiplier, cls, signExplicit }`:
- Pattern: optional sign `[+\-−–]` immediately before the digits, OR the word `ติดลบ` + optional spaces (→ negative, signExplicit true);
  number `\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`; then optional spaces + unit (longest first):
  `พันล้าน`(1e9) `ล้านบาท|ล้าน|ลบ\.|ล\.|MB`(1e6) `แสน`(1e5) `หมื่น`(1e4) `พัน|k|K`(1e3) `%|เปอร์เซ็นต์` (cls percent, ×1).
  No unit → multiplier 1. `cls` = `percent` or `amount`. `value` = signed number × multiplier. `decimals` = fraction digits as written.
  `start/end` cover sign(or ติดลบ)+digits+unit; `raw` = that substring.
- Skip: `\d+-\d+-\d+(?:\.\d+)?` (rai-ngan-wa), digits inside a hashtag (`#` + non-space run), digits that belong to a case-marker
  occurrence (e.g. the `1` of `Case 1`) — find marker occurrences first and mask them.
**`checkPost(text, spec, result, inputs) -> { issues, stats }`**:
1. Zones: find every occurrence of every `cases[].markers` string (Latin case-insensitive). Sorted by position; a case zone runs from
   its marker to the next occurrence of a DIFFERENT case's marker (or end of text). Text before the first marker = zone `global`.
2. Known values of a zone = all global formula values + all numeric input vars (flattened: numbers, rai_ngan_wa parts, comps prices,
   comps_* aggregates) + for a case zone: that case's `<caseId>.*` values and that case's case_table values; zone `global` also knows
   every case's values and case_table values.
3. Token matches expected E if class-compatible (percent-format check ↔ percent token; any other format ↔ amount token) and
   `|value − E| ≤ 0.5 × 10^(−decimals) × multiplier + 1e-9 × max(1,|E|)`. If the token has no explicit sign, also accept when the
   same holds for `|value|` vs `|E|`.
4. For each check: global checks scan the whole text; per_case checks run once per case, only within that case's zones, expected =
   `values["<caseId>.<key>"]`. For each keyword occurrence (Latin case-insensitive): candidates = compatible tokens starting within
   60 chars after the keyword end AND on the same line. If any candidate matches expected → OK. Else if every candidate matches some
   other known value of that zone → ignore. Else the FIRST candidate not matching any known value → issue
   `{ severity:'error', type:'mismatch', checkKey, caseId?, start, end, raw, expected, expectedText, message }`
   (`expectedText` = what autofix would write). Dedupe by token span. If no occurrence produced any candidate →
   `{ severity:'info', type:'missing', checkKey, caseId? }`.
5. Any amount token with multiplier ≥ 1e6 and any percent token that matches no known value of its zone and is not already an issue →
   `{ severity:'warn', type:'unverified', start, end, raw }`.
6. `stats = { checked, ok, mismatch, missing, unverified }`.
**`autofix(text, issues) -> string`**: apply `mismatch` issues from the end backwards; replace only the sign+digits part of the token
(keep unit and spacing) with `formatNumberPart(expected, { ...formulaFormat, signed:false })` computed in the TOKEN's multiplier
(i.e. format `expected / token.multiplier` with the formula's dp, trimmed, commas); negative → `-`; add `+` only if the original had `+`.
E.g. `357.25 ล้าน` with expected 318976000 → `318.98 ล้าน`.

### T7 `seed/formats/feasibility-3case.json`
- `schema_version:1`, `id:"feasibility-3case"`, `name:"Feasibility 3 เคส"`, description `"วิเคราะห์ความคุ้มของที่ดินแบบ 3 เคส Low/Mid/High ตามสัดส่วน Loft"`.
- fields (in order):
  `project_name` text "ชื่อโครงการ" required; `location` text "ทำเล"; `plot` rai_ngan_wa "ที่ดิน (ไร่-งาน-วา)" required;
  `zoning` text "ผังสี"; `far` number "FAR" required; `bonus_pct` number "Bonus %" default 0; `eff_pct` number "Efficiency %" required;
  `build_cost_sqm` number "ค่าก่อสร้าง/ตร.ม." unit "บาท" required; `land_price_sqwa` number "ราคาที่ดิน/ตร.ว." unit "บาท" required;
  `gp_pct` number "GP %" required; `sale_price_sqm` number "ราคาขาย/ตร.ม." unit "บาท" required; `loft_factor` number "Loft factor" default 1.4;
  `case_inputs` case_table "สัดส่วน Loft ต่อเคส" columns `[{"key":"loft_pct","label":"สัดส่วน Loft %","unit":"%"}]`;
  `comps` comps_table "Comps (โครงการเทียบ)".
- cases: `low` "Case 1 · Low" markers `["Case 1","เคส 1","Case1"]` inputs `{"loft_pct":0}`;
  `mid` "Case 2 · Mid" markers `["Case 2","เคส 2","Case2"]` inputs `{"loft_pct":30}`;
  `high` "Case 3 · High" markers `["Case 3","เคส 3","Case3"]` inputs `{"loft_pct":70}`.
- formulas (order matters):
  | key | label | expr | per_case | format |
  |---|---|---|---|---|
  | land_sqwa | ที่ดิน (ตร.ว.) | `plot_rai*400 + plot_ngan*100 + plot_wa` | no | number dp1 suffix " ตร.ว." |
  | land_sqm | ที่ดิน (ตร.ม.) | `land_sqwa*4` | no | number dp1 " ตร.ม." |
  | gfa | GFA | `round(land_sqm*far*(1+bonus_pct/100))` | no | int " ตร.ม." |
  | nsa_base | NSA ฐาน | `round(gfa*eff_pct/100)` | no | int " ตร.ม." |
  | construction_cost | ค่าก่อสร้าง | `gfa*build_cost_sqm` | no | million dp2 " ล้าน" |
  | land_cost | ค่าที่ดิน | `land_sqwa*land_price_sqwa` | no | million dp2 " ล้าน" |
  | hard_cost | ค่าก่อสร้าง + ค่าที่ดิน | `construction_cost + land_cost` | no | million dp2 " ล้าน" |
  | comps_avg_view | ราคาเฉลี่ย comps | `comps_avg` | no | thousand dp1 "k" |
  | comps_min_view | comps ต่ำสุด | `comps_min` | no | thousand dp1 "k" |
  | comps_max_view | comps สูงสุด | `comps_max` | no | thousand dp1 "k" |
  | nsa | NSA | `round(nsa_base*(1-loft_pct/100) + nsa_base*loft_pct/100*loft_factor)` | yes | int " ตร.ม." |
  | pv | PV | `nsa*sale_price_sqm` | yes | million dp2 " ล้าน" |
  | gp | GP | `pv*gp_pct/100` | yes | million dp2 " ล้าน" |
  | budget | งบต้นทุน | `pv*(1-gp_pct/100)` | yes | million dp2 " ล้าน" |
  | margin | ส่วนต่าง | `budget - hard_cost` | yes | million dp2 signed " ล้าน" |
  | margin_pct | % ส่วนต่าง (เทียบ PV) | `margin/pv*100` | yes | percent dp1 signed "%" |
  | status | สถานะ | `if(margin < 0, "ไม่รอด", if(margin_pct <= 5, "รอด", "คุ้ม"))` | yes | text |
- summary `{ "per_case_key": "status" }`.
- notes: `["ส่วนต่างคือเงินที่เหลือไว้จ่าย soft cost, การตลาด และดอกเบี้ย", "ค่าก่อสร้างชั้นลอยของ Loft ยังไม่รวมในตัวเลขนี้"]`.
- narrative_fields: `hook` "มุม Hook"; `gossip` "ข่าว/ซุบซิบโครงการ"; `audience` "กลุ่มลูกค้า/บริบทตลาด"; `assumption_reasons` "เหตุผลของสมมติฐาน".
- tone_options: `loft_note` "ใส่โน้ตอธิบาย Loft" / "อธิบายสั้นๆ ว่า Loft คืออะไร และทำไมทำให้พื้นที่ขายเพิ่ม";
  `legal_comment` "ชวนเม้นเรื่องข้อกฎหมาย" / "ปิดท้ายด้วยการชวนผู้อ่านคอมเมนต์ประเด็นข้อกฎหมายหรือผังเมืองที่อาจทำให้ตัวเลขเปลี่ยน";
  `page_hashtags` "hashtag ประจำเพจ" / "ใส่ hashtag ประจำเพจจาก House Style ไว้ท้ายโพสต์".
- sections s1..s13, `title` exactly as below, `guide` = one short Thai sentence you write describing the section's job:
  1 Hook ไลฟ์สไตล์หรือมุกเปิด · 2 แนะนำโครงการและผู้พัฒนา พร้อมข่าวซุบซิบ · 3 กลุ่มลูกค้าและบริบทตลาด · 4 ตัวเปลี่ยนเข้าช่วงคำนวณ ·
  5 ที่ดินและผังเมือง เทียบกับเพื่อนบ้าน · 6 สมมติฐานพร้อมเหตุผล · 7 อธิบาย 3 เคส · 8 ที่มาของราคาที่ดิน · 9 comps และราคาขายที่เลือก ·
  10 คำนวณทีละเคส · 11 สรุปสั้น · 12 caveat ความเสี่ยง · 13 CTA และ hashtag
- checks (use exactly):
  global — `land_sqwa` ["หรือ","ที่ดิน"]; `land_sqm` ["="]; `gfa` ["GFA"]; `nsa_base` ["NSA ฐาน"]; `construction_cost` ["ค่าก่อสร้าง"];
  `land_cost` ["ค่าที่ดิน"]; `comps_avg_view` ["เฉลี่ย","comps"].
  per_case — `nsa` ["NSA"]; `pv` ["PV","มูลค่าโครงการ"]; `gp` ["GP","กำไรขั้นต้น"]; `budget` ["งบ"]; `margin` ["ส่วนต่าง"]; `margin_pct` ["ส่วนต่าง"].

### T8 Fixtures
`tests/fixtures/klos-inputs.json`:
```json
{
  "project_name": "KLOS บางแค", "location": "บางแค", "plot": "1-1-81.7", "zoning": "ส้ม",
  "far": 7, "bonus_pct": 20, "eff_pct": 51, "build_cost_sqm": 28000, "land_price_sqwa": "300,000",
  "gp_pct": 32, "sale_price_sqm": 100000, "loft_factor": 1.4,
  "case_inputs": { "low": { "loft_pct": 0 }, "mid": { "loft_pct": 30 }, "high": { "loft_pct": 70 } },
  "comps": [ {"name":"A","price_per_sqm":78000}, {"name":"B","price_per_sqm":95000}, {"name":"C","price_per_sqm":87000},
             {"name":"D","price_per_sqm":105000}, {"name":"E","price_per_sqm":86000} ]
}
```
`tests/fixtures/klos-post-swapped.txt` — exactly these lines (UTF-8, LF, final newline):
```
ใครผ่านบางแคช่วงนี้คงเห็นป้าย KLOS ขึ้นแล้ว วันนี้แอดมินขอลองคิดเล่นๆ ว่าที่ดินแปลงนี้คุ้มไหม

ที่ดิน 1-1-81.7 ไร่ หรือ 581.7 ตร.ว. = 2,326.8 ตร.ม. ผังสีส้ม FAR 7 บวก Bonus 20%
GFA ได้ 19,545 ตร.ม. คิด Efficiency 51% ได้ NSA ฐาน 9,968 ตร.ม.
ค่าก่อสร้าง 28,000 บาท/ตร.ม. รวม 547.26 ล้าน ค่าที่ดิน 300,000 บาท/ตร.ว. รวม 174.51 ล้าน

ราคาขายอิง comps 5 โครงการแถวนี้ เฉลี่ย 90.2k ต่อ ตร.ม. แอดมินเลือกใช้ 100,000 บาท/ตร.ม.

Case 1 ไม่มี Loft
NSA 9,968 ตร.ม. PV 996.8 ล้าน
GP 32% = 357.25 ล้าน เหลืองบ 677.82 ล้าน
ส่วนต่าง -43.95 ล้าน (-4.4%) ไม่รอด

Case 2 Loft 30%
NSA 11,164 ตร.ม. PV 1,116.4 ล้าน
GP 32% = 318.98 ล้าน เหลืองบ 759.15 ล้าน
ส่วนต่าง +37.38 ล้าน (+3.3%) รอด

Case 3 Loft 70%
NSA 12,759 ตร.ม. PV 1,275.9 ล้าน
GP 32% = 408.29 ล้าน เหลืองบ 867.61 ล้าน
ส่วนต่าง +145.84 ล้าน (+11.4%) คุ้ม

#ที่ว่างว่าง
```
(GP of Case 1 and Case 2 are deliberately swapped — this mirrors the real bug in the author's original post.)

### T9 Tests (`node:test` + `node:assert/strict`, files `.test.mjs`) and package.json
Change the test script to `"node --test tests/*.test.js tests/*.test.mjs"`.
- `engine-expr.test.mjs`: `1+2*3`=7, `(1+2)*3`=9, `2^3^2`=512, `-2^2`=-4, `round(2.5)`=3, `round(-2.5)`=-3, `round(1.005,2)`=1.01,
  `if(1, 5, 1/0)`=5, `low.pv` lookup, string result `if(0,"a","ข")`="ข". Rejections with codes: `constructor` FORBIDDEN_IDENT,
  `__proto__` FORBIDDEN_IDENT, `a.constructor` FORBIDDEN_IDENT, `alert(1)` UNKNOWN_FUNC, `x[0]` SYNTAX, `a;b` SYNTAX, `` `t` `` SYNTAX,
  `1/0` DIV_ZERO, 501-char input TOO_COMPLEX, `nope+1` UNKNOWN_IDENT. Static test: engine source files contain no `eval(` / `Function(`.
- `engine-calc.test.mjs` — KLOS golden, assert on `formatNumberPart(value, formula.format)`:
  land_sqwa `581.7`, land_sqm `2,326.8`, gfa `19,545`, nsa_base `9,968`, construction_cost `547.26`, land_cost `174.51`,
  comps_avg_view `90.2`, comps_min_view `78`, comps_max_view `105`;
  low: nsa `9,968` pv `996.8` gp `318.98` budget `677.82` margin `-43.95` margin_pct `-4.4` status `ไม่รอด`;
  mid: nsa `11,164` pv `1,116.4` gp `357.25` budget `759.15` margin `+37.38` margin_pct `+3.3` status `รอด`;
  high: nsa `12,759` pv `1,275.9` gp `408.29` budget `867.61` margin `+145.84` margin_pct `+11.4` status `คุ้ม`.
  Also `result.summary === "Case 1 · Low ไม่รอด · Case 2 · Mid รอด · Case 3 · High คุ้ม"`; inputs without `far` → `ok:false`, errors include
  MISSING_INPUT for `far` and DEPENDENCY for `gfa`; module test: register `double` = `(args) => ({ x: args.n * 2 })`, spec with formula
  `{ "module":"double", "args":{"n":21}, "into":"m" }` → `values.m_x === 42` (call `clearModules()` after).
- `engine-numscan.test.mjs`: `scanNumbers("ส่วนต่าง -43.95 ล้าน (-4.4%)")` → 2 tokens (−43950000 amount decimals 2; −4.4 percent);
  `"ติดลบ 43.95 ล."` → value −43950000; `"1-1-81.7 ไร่"` → 0 tokens; `"#ที่ว่างว่าง2024"` → 0 tokens; `"90.2k"` → 90200.
  checkPost on the fixture: exactly 2 `mismatch` issues — `gp`/`low` whose raw contains `357.25` with expected 318976000, and
  `gp`/`mid` whose raw contains `318.98`. `autofix` result contains the Case 1 block line `GP 32% = 318.98 ล้าน` and Case 2 block line
  `GP 32% = 357.25 ล้าน`; checkPost on fixed text → 0 mismatches. Second case: in the FIXED text replace `+37.38` with `+37.83`
  → exactly one mismatch `margin`/`mid`.
- `engine-spec.test.mjs`: seed spec → 0 errors; clone with expr `gfa*unknown_var` → error string contains `unknown_var`; formula
  referencing a key defined later → error; check with unknown key → error; field type `"color"` → error; expr `constructor` → error.

## 5. CONSTRAINTS
- Absolutely no `eval`, `new Function`, `Function(`, `with`, or dynamic `import()` in engine code.
- Do NOT change any expected number/string in T9 or the fixture to make a test pass. If a golden value cannot be reached, STOP,
  and report computed vs expected in OUTPUT — that is a reviewer question, not something to "fix".
- Engine is pure (no DOM, no fetch, no Node-only APIs). `gas/` untouched; P0 tests must still pass.

## 6. ACCEPTANCE CRITERIA
- [ ] AC1: `npm test` passes all P0 + P1 tests, 0 failures.
- [ ] AC2: Every KLOS golden value in T9 asserted exactly as written, passing.
- [ ] AC3: Swapped-GP fixture → exactly 2 mismatches (gp/low, gp/mid); autofix restores both; re-check = 0 mismatches.
- [ ] AC4: All rejection cases in T9 give the specified codes; no eval/Function in engine source.
- [ ] AC5: seed spec is valid JSON, 13 sections with exact titles, 3 tone_options, 2 notes, 4 narrative_fields, validates with 0 errors.
- [ ] AC6: Engine files import only each other via relative paths; no packages.

## 7. Delivery format
Write `docs/relay/P1-OUTPUT.md` starting with `<!-- PLAN-RELAY:REVIEW -->`: file list, `npm test` summary (tests/pass/fail and any
failing names), SELF-CHECK per AC with evidence, deviations/questions ("None" if none). Then reply with a 5-line report.
