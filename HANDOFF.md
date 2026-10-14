# HANDOFF — TWW Content Writer Hub

เอกสารส่งมอบโปรเจกต์ (สรุป ณ 2026-10-14) อ่านคู่กับ `README.md`, `docs/API.md`, `docs/relay/`

## 1) ระบบนี้คืออะไร
PWA ให้เพื่อนกลุ่มหนึ่งเขียนบทวิเคราะห์อสังหาริมทรัพย์ภาษาไทย: กรอกตัวเลข, engine คำนวณผล, สร้าง prompt
ให้ copy ไปวางใน AI ภายนอก, วางโพสต์กลับมาตรวจตัวเลข แล้วบันทึกลง Sheet/Docs
ทุกอย่างอยู่ใต้บัญชี teewangwangland

- Live app: https://teewangwangland-max.github.io/tww-writer/
- Repo (public): https://github.com/teewangwangland-max/tww-writer
- Frontend: static PWA ใน `web/` บน GitHub Pages
- Backend: Google Apps Script (V8) ใน `gas/` เป็น JSON API (POST, `text/plain`) + Google Sheet 7 tabs
- GAS stable /exec deployment ID: `AKfycbwXbLVG66uewdwFET6nfc5NDyVw5P6NXvOjxBSsYXsA6Ex0FALaW5CQmZnEZcIPTr5bmw` (ตอนนี้ version 4)
- Push เข้า `main` -> GitHub Actions รัน `npm test` แล้ว publish เฉพาะ `web/`

## 2) โครงสร้างโฟลเดอร์
```
gas/        Apps Script source (clasp rootDir): Api, Auth, Users, Db, Posts, Formats, StyleDna,
            Examples, Comps, Admin, Setup, Config, SeedData (generated), appsscript.json
web/        PWA: index.html, manifest, sw.js, css/, icons/, js/
  js/engine     คำนวณ/ตรวจตัวเลข (ไม่มี eval)
  js/views      หน้าจอต่าง ๆ   js/prompt  สร้าง prompt   js/style  Style DNA editor/update/examples
tests/      node:test (.test.js สำหรับ GAS mock, .test.mjs สำหรับ web/engine) + fixtures + helpers
scripts/    serve.mjs (dev), build-seed.mjs, make-icons.mjs
seed/       seed formats (build เป็น gas/SeedData.gs)
docs/       API.md และ docs/relay/ (P0..P6 PLAN/OUTPUT, HANDOFF-BRIEF)
```

## 3) วิธีรันในเครื่อง
```
npm test
```
รันเทสต์ทั้งหมด (ล่าสุด 95 tests ผ่าน)
```
npm run dev
```
เปิด static server ที่ http://localhost:5173 (`scripts/serve.mjs`)

ไม่มี dependencies; ต้องมี Node และ `clasp` (login แล้วด้วย user `teewangwangland`) เมื่อจะแตะ backend

## 4) วิธี deploy
**Frontend**: commit + push เข้า `main` เท่านั้น Actions จะทดสอบแล้ว publish `web/` เอง
ใช้ PowerShell สำหรับ `gh`/`git` (gh config ของ teewangwangland-max active อยู่ใน PowerShell ไม่ใช่ Git Bash)
commit ใช้ identity ประจำ repo `teewangwangland-max` + GitHub noreply email

**Backend (GAS)** — ก่อนเริ่ม ต้องแสดง diff ของ `gas/` ให้ Bank ดูก่อนเสมอ แล้วทำตามลำดับ

Build seed แล้ว push โค้ดขึ้น GAS
```bash
npm run gas:push
```
สร้าง version ใหม่ (แก้ `<desc>`)
```bash
clasp create-version "<desc>" --user teewangwangland
```
ชี้ deployment เดิมไปที่ version ใหม่ (`<id>` = deployment ID ด้านบน, `<n>` = เลข version ที่เพิ่งสร้าง)
```bash
clasp update-deployment <id> -V <n> -d "<desc>" --user teewangwangland
```

## 5) กฎห้ามทำ
- clasp ทุกคำสั่งต้องลงท้าย `--user teewangwangland`
- ห้าม overwrite version เดิม สร้าง version ใหม่เสมอ และแสดง diff ของ `gas/` ให้ Bank ก่อน
- ตัวเลขมาจาก engine (`web/js/engine`) เท่านั้น ห้ามใช้ eval
- ห้ามเรียก AI API ที่ใดเลย (ใช้ Copy-Prompt เท่านั้น)
- ห้ามลบข้อมูล: ซ่อน = `active` FALSE; Formats/StyleDNA เป็น append-only
- ห้ามใส่ credentials ในโค้ด (รหัสผ่านเก็บแบบ salted+hashed ใน Users; สร้าง user ผ่าน Script Properties ใน `adminCreateUser`)
- ห้ามจัดการรหัสผ่านของ Bank (username: `BANK`)
- กฎปัดเศษ: ค่า golden ของ KLOS ตรงเป๊ะได้ก็เพราะ GFA และ NSA ต่อ case ถูก `round()` เป็นจำนวนเต็มใน Feasibility spec — อย่าเอาออก
- SW ห้าม cache API hosts และลบได้เฉพาะ cache `tww-shell-*` ของตัวเอง

## 6) สถานะ phase + AC
| Phase | เรื่อง | สถานะ |
|---|---|---|
| P0 | scaffold, Sheet schema 7 tabs, setup, mock tests | done, reviewed |
| P1 | engine คำนวณ/ตรวจตัวเลข, KLOS golden, seed spec | done, reviewed |
| P2 | GAS API: auth, data, Docs, versioning | done, reviewed |
| P3 | PWA shell, router, Library, SW | done, reviewed |
| P4 | wizard เขียนโพสต์ 5 ขั้น | done, reviewed |
| P5 | admin format extractor (+ format #2 fixture) | done, reviewed |
| P6 | Style DNA, personal layer, example library, House page, folder import | done, reviewed |

- ทดสอบ: 95 tests ผ่านทั้งหมด
- Acceptance criteria โครงการ 7 ข้อ: ผ่านครบ ยกเว้นข้อ "ติดตั้งบนมือถือ" ที่ Bank ต้องเช็คเองบนเครื่องจริง
- Reviewer เปิดตรวจใน browser จริงแล้ว: login, คลังโพสต์, flow KLOS ครบ 5 ขั้นจนสร้าง Doc, หน้าถอดรูปแบบ + บันทึก Rental Yield,
  หน้า Style/House, ดูด Doc ทั้งโฟลเดอร์กับ Drive จริง (32 ไฟล์) และหน้า login บน GitHub Pages
- ยังไม่ได้เช็คจริง: ติดตั้ง PWA บนมือถือ, การอัปเดต SW เมื่อมีเวอร์ชันใหม่, การสร้าง Style DNA v1 ผ่าน Copy-Prompt กับ AI จริง

## 7) ข้อมูลที่ค้างใน Sheet/Drive
- 1 โพสต์ทดสอบ "[ทดสอบ] KLOS บางแค" + 1 Doc กำพร้าจาก bug P4 ที่แก้แล้ว — Bank ลบมือเองได้ (ระบบไม่มีฟังก์ชันลบ)
- Format "Rental Yield คอนโด" บันทึกเป็น draft v1 (หลักฐานของ AC)
- นำเข้า Docs เก่า 32 ไฟล์เป็นตัวอย่างของ Bank: 8 tag Feasibility, 20 ไม่มี tag, 4 ซ่อนอยู่
- ยังไม่มี Style DNA version ใด ๆ — Bank สร้าง v1 เองผ่าน UI (House ใช้ DEFAULT_HOUSE_DNA จนกว่าจะมี)

## 8) ขั้นต่อไป
1. Bank ติดตั้ง PWA บนมือถือ แล้วเช็ค UI จริง
2. สร้าง House Style DNA v1 (`#/style/house`, admin) และ personal Style DNA v1 (`#/style`)
3. เลือกว่าจะ publish format Rental Yield หรือเก็บเป็น draft
4. เพิ่มเพื่อน ๆ ผ่าน `adminCreateUser` (Script Properties)
5. ลบข้อมูลทดสอบ (โพสต์ + Doc กำพร้า) ด้วยมือถ้าต้องการ
