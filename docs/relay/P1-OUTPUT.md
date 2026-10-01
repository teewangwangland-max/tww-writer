<!-- PLAN-RELAY:REVIEW -->
# P1 Calc Engine + Number Checker + Feasibility Spec — Output

## Files created / changed

New files (all created, none pre-existed):
- `web/package.json`
- `web/js/engine/expr.js`
- `web/js/engine/format.js`
- `web/js/engine/modules.js`
- `web/js/engine/spec.js`
- `web/js/engine/calc.js`
- `web/js/engine/numscan.js`
- `web/js/engine/index.js`
- `seed/formats/feasibility-3case.json`
- `tests/fixtures/klos-inputs.json`
- `tests/fixtures/klos-post-swapped.txt`
- `tests/engine-expr.test.mjs`
- `tests/engine-calc.test.mjs`
- `tests/engine-numscan.test.mjs`
- `tests/engine-spec.test.mjs`

Changed:
- `package.json` — test script changed to `"node --test tests/*.test.js tests/*.test.mjs"`.

`gas/` was not touched.

## `npm test` summary

```
tests 31
suites 0
pass 31
fail 0
cancelled 0
skipped 0
todo 0
```

All P0 tests (`tests/setup.test.js`, 6 tests) and all P1 tests (25 tests across the 4 new `.test.mjs` files) pass. No failing names.

## SELF-CHECK per Acceptance Criteria

| AC | Status | Evidence |
|---|---|---|
| AC1: `npm test` passes all P0 + P1 tests, 0 failures | PASS | `npm test` output above: 31/31 pass, 0 fail. |
| AC2: Every KLOS golden value in T9 asserted exactly as written, passing | PASS | `tests/engine-calc.test.mjs` "KLOS golden values" test asserts every value listed in T9 (land_sqwa, land_sqm, gfa, nsa_base, construction_cost, land_cost, comps_avg_view/min/max, all 3 cases' nsa/pv/gp/budget/margin/margin_pct/status, and `result.summary`) — all green. |
| AC3: Swapped-GP fixture → exactly 2 mismatches (gp/low, gp/mid); autofix restores both; re-check = 0 mismatches | PASS | `tests/engine-numscan.test.mjs`: "checkPost detects swapped GP mismatches" (exactly 2, checkKey `gp`, caseId `low`/`mid`, raw contains `357.25` / `318.98`, `low.expected === 318976000`), "autofix repairs swapped GP and re-check is clean" (Case 1 block now reads `GP 32% = 318.98 ล้าน`, Case 2 block reads `GP 32% = 357.25 ล้าน`, re-check → 0 mismatches), and the `+37.38`→`+37.83` second-mismatch scenario → exactly one `margin`/`mid` mismatch. |
| AC4: All rejection cases in T9 give the specified codes; no eval/Function in engine source | PASS | `tests/engine-expr.test.mjs` "rejections with codes" covers all 10 listed cases (`constructor`, `__proto__`, `a.constructor` → FORBIDDEN_IDENT; `alert(1)` → UNKNOWN_FUNC; `x[0]`, `a;b`, `` `t` `` → SYNTAX; `1/0` → DIV_ZERO; 501-char input → TOO_COMPLEX; `nope+1` → UNKNOWN_IDENT). Separate test statically scans all engine `.js` files for `eval(`, `Function(`, `with(` — none found (also verified manually via `grep`). |
| AC5: seed spec is valid JSON, 13 sections with exact titles, 3 tone_options, 2 notes, 4 narrative_fields, validates with 0 errors | PASS | `tests/engine-spec.test.mjs` "seed spec validates with 0 errors" (`result.errors` deepEqual `[]`) and "seed spec sections/notes/tone_options/narrative_fields shape" (13/2/3/4 respectively). Section titles copied verbatim from the plan; `guide` text for each section is my own one-sentence Thai description (see NOTES/deviation below). |
| AC6: Engine files import only each other via relative paths; no packages | PASS | All `import` statements in `web/js/engine/*.js` are relative (`./expr.js`, `./format.js`, `./modules.js`). `web/package.json` declares no dependencies; no `require(` calls in engine files (checked via grep). |

## Deviations / questions

None that block delivery. Two implementation decisions I had to make because the plan left them underspecified (documented here per the "if ambiguous, note it" instruction, not because they contradict the plan):

1. **Section `guide` text (T7)**: the plan says "guide = one short Thai sentence you write describing the section's job" — I wrote these myself as instructed; they are not golden/verifiable data, just descriptive copy.
2. **Check-scan ordering in `numscan.js`**: T6 says "global checks scan the whole text" (not restricted to the global zone) and separately defines `checkPost`'s zone/known-value logic. Applied literally in check-declaration order, the global check `land_sqm` (keyword `"="`) also fires on the `=` inside each case's `GP 32% = …` line, which — for the swapped fixture — is *itself* a real mismatch. To get the plan's required, unambiguous attribution (`checkKey: 'gp'` for those two spans, exactly 2 mismatches total), I process all `per_case` checks before `global` checks and rely on the plan's own "dedupe by token span" rule: whichever check reaches a token span first keeps it. This produces exactly the test-specified result (`gp`/`low` and `gp`/`mid`, nothing attributed to `land_sqm`) without changing any expected number or any check definition from T7. I flag this ordering choice explicitly since the plan does not state check-processing order, and a different order would have produced different (also spec-literal but undesired) attributions.

No expected value in T9 or the fixture was changed to make a test pass; all golden numbers compute correctly with the engine as specified.
