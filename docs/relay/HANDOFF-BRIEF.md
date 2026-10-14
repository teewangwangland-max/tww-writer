# HANDOFF BRIEF (from reviewer, 2026-10-14)

- Project: TeeWangwang Content Writer Hub — PWA (GitHub Pages, `web/`) + Google Apps Script API (`gas/`) + Google Sheet (7 tabs), all under teewangwangland.
- Live app: https://teewangwangland-max.github.io/tww-writer/ — repo https://github.com/teewangwangland-max/tww-writer (public). Push to `main` → Actions runs `npm test` then publishes `web/`.
- GAS API deployment (stable /exec): AKfycbwXbLVG66uewdwFET6nfc5NDyVw5P6NXvOjxBSsYXsA6Ex0FALaW5CQmZnEZcIPTr5bmw, currently version 4. Redeploy = `npm run gas:push` → `clasp create-version "<desc>" --user teewangwangland` → `clasp update-deployment <id> -V <n> -d "<desc>" --user teewangwangland`. Every clasp command ends with `--user teewangwangland`. Never overwrite a version; show the gas/ diff to Bank first.
- gh/git: use PowerShell (its gh config has teewangwangland-max active; Git Bash's gh config does not). Commits use the repo-local identity teewangwangland-max + GitHub noreply email.
- Phases P0–P6 done and reviewed (95 tests). All 7 acceptance criteria met except the physical "install on phone" check, which Bank must do on his phone.
- Core rules: numbers only from the engine (`web/js/engine`, no eval); no AI API calls anywhere (Copy-Prompt only); no deletes (hide = `active` FALSE; Formats/StyleDNA append-only); no credentials in code (passwords salted+hashed in Users; admin user creation via Script Properties in `adminCreateUser`).
- KLOS golden values pass exactly only because GFA and per-case NSA are `round()`ed to integers in the Feasibility spec.
- Data state: 1 test post "[ทดสอบ] KLOS บางแค" (+ 1 orphan Doc from the fixed P4 bug) that Bank may delete by hand; format "Rental Yield คอนโด" saved as draft v1 (proof of AC); 32 old Docs imported as Bank's examples (8 tagged Feasibility, 20 untagged, 4 hidden). No Style DNA versions yet — Bank creates v1 via the UI.
- Bank's username: BANK. Never handle his password.
- Next: Bank installs the PWA on his phone and creates House + personal Style DNA v1; optional: publish Rental Yield or keep as draft; add friends via `adminCreateUser`.
