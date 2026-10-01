# TWW Content Writer Hub

PWA เล็ก ๆ สำหรับให้เพื่อนกลุ่มหนึ่งเขียนบทวิเคราะห์อสังหาริมทรัพย์ภาษาไทย

## Architecture
- Backend: Google Apps Script (standalone script, V8) + Google Sheet เดียว เป็นเจ้าของโดย
  `teewangwangland@gmail.com` พัฒนาในเครื่องด้วย `clasp`
- Frontend: static files ใน `web/` (จะ deploy ผ่าน GitHub Pages ภายหลัง) เรียก GAS web app
  เป็น JSON API ด้วย POST, `Content-Type: text/plain`, body = JSON string (เพื่อเลี่ยง CORS preflight)
- แอปนี้ไม่เรียก AI API ใด ๆ ทั้งสิ้น ไม่มี API key อยู่ในโค้ด

## โครงสร้างโฟลเดอร์
```
gas/                 Apps Script source (clasp rootDir)
  appsscript.json
  Config.gs
  Setup.gs
  Api.gs
  .claspignore
web/
  index.html
tests/
  helpers/gas-mock.js
  setup.test.js
seed/
docs/relay/
```

## กติกาสำคัญ
- คำสั่ง `clasp` ทุกคำสั่งต้องลงท้ายด้วย `--user teewangwangland` เสมอ
- การ deploy GAS ให้สร้าง **New Version ใหม่เสมอ** ห้าม overwrite deployment เดิม
- ห้ามใส่รหัสผ่าน, credentials หรือ token ใด ๆ ลงในโค้ดเด็ดขาด

## รันเทสต์
```
npm test
```
