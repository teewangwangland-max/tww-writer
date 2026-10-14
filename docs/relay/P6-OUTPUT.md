<!-- PLAN-RELAY:REVIEW -->
# P6 OUTPUT — Style DNA + Personal Layer + Example Library

## Files
Backend: `gas/Examples.gs` (examples.update, include_hidden, add source/source_ref), `gas/Api.gs` (route), `docs/API.md`.
New web: `web/js/views/style.js`, `web/js/views/style-house.js`, `web/js/style/dna-editor.js`, `web/js/style/dna-update.js`,
`web/js/style/examples-panel.js`, `web/js/prompt/build-dna.js`.
Edited web: `router.js` (#/style, #/style/house admin), `app.js` (House Style header link for admin), `config.js` (APP_VERSION 0.6.0),
`sw.js` (tww-shell-v0.6.0 + precache), `css/app.css`.
Tests: `tests/api-examples-update.test.js` (4 tests), `tests/web-dna.test.mjs` (6 tests).

## npm test
94 tests, 94 pass, 0 fail (previously 84).

## Backend diff (git diff --stat -- gas/)
```
 gas/Api.gs      |  1 +
 gas/Examples.gs | 52 +++++++---
 2 files changed
```
Only T2 changes. No delete calls added (existing static no-delete test still green).

## SELF-CHECK
- AC1 PASS: `npm test` 0 failures incl. T2 and T8 tests.
- AC2 PASS (code + module-import smoke, not in browser): profile save calls `users.updateProfile` (newline-joined strings) then `store.setAuth`;
  dna-editor shows "เวอร์ชันปัจจุบัน v<n> · date · โดย name", manual edit requires changelog, saves via `styledna.save`; history newest first,
  changelog 200-char truncate + expand, rollback with inline confirm.
- AC3 PASS (code): dna-update picks examples (already-used = "เคยใช้สอนแล้ว", unchecked), copy prompt + 3 AI links + preview, paste -> parseDnaAnswer ->
  diff (+/− markers plus color), save with changelog text and `source_example_ids` of checked ids.
- AC4 PASS (code): examples-panel list with include_hidden for managers, dimmed + "ซ่อนอยู่", hide/show, change format, import Doc (duplicate message),
  manual add, admin promote with dedupe check on `source_ref` (HOUSE list) and `source:'promoted'`.
- AC5 PASS (code): `#/style/house` route has `admin: true`; House DNA falls back to DEFAULT_HOUSE_DNA with the "ยังไม่มีเวอร์ชันในระบบ" note;
  folder import loops up to 10 rounds with live "นำเข้าแล้ว N · ข้าม (ซ้ำ) M" and Thai access error.
- AC6 PASS: backend limited to T2, documented in API.md.

## NOT verified in a browser
All UI screens (layout, 44px targets, clipboard, real API round-trips, folder import against real Drive, SW update). Only syntax/import smoke
and the pure/backend unit tests were run.

## Deviations / decisions
- When the AI answer omits a field, the proposed DNA keeps the current value for that field (merge over current) so House number_rules/hashtags
  are not lost by omission; personal proposals drop number_rules/hashtags.
- Promote requires the source example to have a format (button replaced by a hint otherwise) since `examples.add` requires format_id.
- Promote dedupe lookup uses `include_hidden: true` so a hidden promoted copy still counts as already promoted.
- Folder import: SERVER_ERROR / NOT_FOUND / DOC_NOT_ACCESSIBLE all map to the Thai "share the folder" message (Drive errors surface as SERVER_ERROR).
- Placeholder view file left in place (still precached), no longer routed.
