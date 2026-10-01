<!-- PLAN-RELAY:REVIEW -->
# P4 Write-Post Flow - Output

## Files
New (web/js): `views/pick-format.js`, `views/wizard.js`, `views/post-view.js`, `wizard-state.js`, `fields.js`, `results-view.js`, `checker-view.js`, `formats.js`, `prompt-data.js`, `clipboard.js`, `prompt/build-write.js`, `prompt/house-default.js`.
New tests: `tests/web-prompt.test.mjs`, `tests/web-wizard-state.test.mjs`.
Changed: `web/js/router.js` (4 routes), `web/sw.js` (CACHE v0.4.0 + precache), `web/js/config.js` (0.4.0), `web/css/app.css` (appended P4 block), `tests/web-static.test.mjs` (2 new greps).
Untouched: `gas/`, `web/js/engine/`.

## npm test
`npm test`: tests 68, pass 68, fail 0. All new view modules also import cleanly in Node (syntax/import-graph check).

## SELF-CHECK
| AC | Result | Evidence |
|---|---|---|
| AC1 | pass | 68/68 pass incl. web-prompt (8), web-wizard-state (4), static greps (spec-driven words, `fetch(` only in api.js/sw.js) |
| AC2 | pass (code) | router.js routes `#/new`, `#/new/:formatId`, `#/edit/:postId`, `#/post/:id`; wizard.js has 5 steps, stepper back-nav (done/visited steps clickable), debounced 500 ms autosave to `tww.draft.<formatId>` / `tww.draft.post.<postId>`, draft bar with ทำต่อ / เริ่มใหม่ + inline "ล้างร่างนี้?" ใช่/ไม่ |
| AC3 | pass (code) | fields.js has one renderer per type (text, number, rai_ngan_wa, case_table, comps_table); comps picker sheet uses `comps.list`; "เก็บเข้าคลัง" calls `comps.add` then shows "เก็บแล้ว"; live count/avg via `formatValue` |
| AC4 | pass (tests) + code | prompt structure verified by web-prompt.test.mjs; copy = `navigator.clipboard.writeText` with textarea+execCommand fallback (clipboard.js); 3 links with `target=_blank rel="noopener noreferrer"` shown after copy |
| AC5 | pass (code) | checker-view.js: status line, highlighted preview (mismatch `.hl-bad` 12% #B3261E tint + underline, unverified dotted), per-issue "แก้ให้" and "แก้ทั้งหมด" (>=2) call engine `autofix` then re-run `checkPost` |
| AC6 | pass (code) | step 5: saveAsExample checkbox, mismatch warning + required ack, 3 save buttons, payload built exactly per T3 (`post_id` only when known, `createDoc` only when true, `saveAsExample` top-level); draft removed on success; "บันทึกเป็นร่าง" in stepper from step 2 |
| AC7 | pass (code) | post-view.js: header, status pill, Thai date, Doc link, results (stored first, upgraded to re-compute when `format_version` matches), pre-wrap body + copy button, owner-only "แก้ไข" to `#/edit/<id>`; wizard edit mode redirects non-owners to `#/post/<id>` and starts at step 4 |

## NOT verified in a browser
Everything visual and interactive: layout, stepper, responsive case table/blocks at 560px, comps sheet, clipboard on iOS/Android, opening AI tabs, highlight rendering, autosave/resume behaviour, live API calls (posts.save, comps.add, styledna/examples loading). Only Node tests and module-import checks were run.

## Deviations / questions
- Plan T9 says "the 13 section titles appear in order" for the prompt; the template has 11 headings and the KLOS spec has 13 outline sections. Tests cover both (11 headings in order, 13 spec section titles in order).
- Step 3 AI link buttons are revealed after the first successful copy (plan says "Then").
- `getSpec` falls back to the cached spec only on NETWORK errors (not NOT_FOUND/FORBIDDEN), so unpublished formats are not served from cache.
- Blank rai/ngan/wa and comps rows without a price are treated as missing before `compute`/`checkPost` (via `normalizeInputs`); saved `inputs` stay as entered.
- Empty sections ("วัตถุดิบเล่าเรื่อง" with no text) keep their heading, per "omit only where stated".
- Questions: None.
