<!-- PLAN-RELAY:REVIEW -->
# P5 Output

## Files
New:
- web/js/views/admin-formats.js, web/js/views/format-extract.js
- web/js/prompt/build-extract.js, web/js/prompt/spec-schema-doc.js, web/js/spec-json.js
- seed/formats/rental-yield.json, tests/fixtures/rental-yield-post.txt
- tests/web-extract.test.mjs, tests/engine-format2.test.mjs

Changed:
- web/js/engine/calc.js (summary.key), web/js/engine/spec.js (summary validation)
- web/js/router.js (3 admin routes), web/js/views/pick-format.js ("ร่าง" pill), web/js/results-view.js (verdict pill for global summary.key)
- web/js/config.js (APP_VERSION 0.5.0), web/sw.js (cache v0.5.0 + precache), web/css/app.css
- tests/web-static.test.mjs: banned-word list extended with `rental`, `yield` (the plan asks the new UI files to avoid them)

## npm test
84 tests, 84 pass, 0 fail (before: 69 existing tests, all unmodified except the word-list extension above).

## SELF-CHECK
| AC | Result | Evidence |
|---|---|---|
| AC1 | pass | `npm test`: 84/84, includes engine-format2 (5 tests) and web-extract (10 tests) |
| AC2 | pass (code + unit level) | admin-formats.js: cards with name, mono id, v<n>, pill ใช้งาน/ร่าง, "แก้สเปก", toggle button with inline confirm text "จะบันทึกเป็นเวอร์ชันใหม่ v<n+1> สถานะ <..> ยืนยัน?" then formats.get + formats.save. Routes `/admin/formats`, `/new`, `/edit/:id` all `admin: true` (resolve() redirects non-admins). pick-format shows "ร่าง" pill when status is draft |
| AC3 | pass (code level, not run in browser) | format-extract.js: 5-step stepper; autosave to `tww.extract.draft` / `tww.extract.edit.<id>` with resume bar; id regex + error text + existing-id note; edit prefill (name/id, newest HOUSE example as source); debounce 500 ms extractJson + forced id/name with note + validateSpec; preview sections (fields via renderFields, formulas table, cases, sections, checks, tone, notes); step 4 compute + renderResults + checkPost headline "สูตรตรงกับโพสต์ต้นแบบ <ok> จาก <checked> จุด", highlighted source, "โพสต์เขียน <raw> สูตรได้ <expectedText>"; step 5 save draft/publish (disabled while errors), sample_inputs = test form inputs, optional HOUSE examples.add, success links, draft cleared |
| AC4 | pass | web-extract.test.mjs: headings in order, markers, `"sample_inputs"`, `round(x,dp)`, `"feasibility-3case"`, no undefined/null/[object Object], example section absent for null. SPEC_SCHEMA_DOC is 60 lines and covers every rule listed (asserted by a test on key phrases) |
| AC5 | pass | engine-format2.test.mjs: spec validates 0 errors; formatted values 100,000 / 165,000 / 25,200 / 139,800 / 5.14 / 3.99 / 25 / รอด, summary "รอด"; checkPost on fixture mismatch 0, missing 0, ok 7; Net yield 4.99% gives exactly one mismatch `net_yield`, autofix restores 3.99%; summary `{key:'nope'}` gives an error mentioning nope. The word list in web-static now bans rental/yield in UI files and passes |
| AC6 | pass | calc.js: `summary.key` sets result.summary to the formula display text (per_case_key path unchanged); spec.js: `summary.key` must be an existing global formula, `summary.per_case_key` must be an existing per-case formula. All pre-existing engine tests green |

## NOT verified in a browser
- None of the new screens (admin list, extractor 5 steps, resume bar, preview, step 4 report, publish confirm) were opened in a browser or against the live GAS API; syntax-checked with `node --check` and logic covered only by the pure-function tests.
- Real AI round trip (prompt quality) not tried.
- Service worker update to v0.5.0 not observed.

## Notes and deviations
- None against the plan's behaviour. Decisions:
  - The example spec in the extraction prompt is fetched at runtime from `formats.get` of the first other format in `formats.list` (published preferred), so no format id is hardcoded in the UI.
  - In edit mode the id input is read-only (changing it would create a different format).
  - Extra pure exports in spec-json.js: `inputsToSample`, `sampleToInputs` (convert between sample_inputs and form inputs; tested).
  - `"sample_inputs"` (quoted) is placed in the "รูปแบบคำตอบ" section so it appears even when the example spec has none.
  - `gas/SeedData.gs` was NOT regenerated (gas/ is out of scope); run `npm run build:seed` when rental-yield should be seeded server-side. Format 2 is otherwise only loadable by saving it through the extractor or seeding.
  - The wizard still stores `verdict_key` from `summary.per_case_key` only, so a saved post of a global-summary format shows its verdict as plain text in the stored-results fallback (no pill). Not in scope.
