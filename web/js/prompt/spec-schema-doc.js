// Pure: the written rules of the format spec, embedded in the extraction prompt.
export const SPEC_SCHEMA_DOC = `สเปกคือ JSON object เดียว มี key ระดับบนดังนี้
- จำเป็นต้องมี: schema_version (เลข 1), id, name, fields, formulas, sections, checks
- ใส่หรือไม่ใส่ก็ได้: description, cases, summary, notes, narrative_fields, tone_options, sample_inputs

fields: array ของ { key, label, type, required?, unit?, default?, hint? }
- key ต้องตรง regex ^[a-z][a-z0-9_]*$ และห้ามซ้ำกับ key ของ field หรือ formula อื่น
- type ใช้ได้เฉพาะ: number | text | rai_ngan_wa | comps_table | case_table
- number: ใช้ในสูตรเป็นตัวแปร <key>
- text: ข้อความ (ชื่อโครงการ ทำเล) ห้ามอ้างถึงในสูตร
- rai_ngan_wa: ที่ดิน ไร่-งาน-วา ให้ตัวแปร <key>_rai, <key>_ngan, <key>_wa
- comps_table: ตารางโครงการเทียบ [{ name, price_per_sqm }] ให้ตัวแปร <key>_count, <key>_avg, <key>_min, <key>_max
- case_table: ตารางค่าต่อเคส มีได้ไม่เกิน 1 field, ต้องมี columns: [{ key, label, unit? }] และต้องมี cases
  ตัวแปรของ column ใช้ได้เฉพาะในสูตรที่ per_case:true (เรียกด้วยชื่อ column ตรงๆ)

cases (ไม่มีเคสให้ใส่ [] หรือไม่ใส่เลย): array ของ { id, label, markers, inputs? }
- id ตรง regex ^[a-z][a-z0-9_]*$
- markers = คำที่โพสต์ใช้ขึ้นต้นหัวข้อของเคสนั้นๆ ตรงตามตัวอักษร เช่น ["Case 1","เคส 1"]
- inputs = ค่าตั้งต้นของ column ใน case_table

formulas: array เรียงตามลำดับการคำนวณ แต่ละตัวเป็น
  { key, label, expr, per_case?, show?, format? }
- key ตรง regex ^[a-z][a-z0-9_]*$ ห้ามซ้ำ
- สูตร global (ไม่ใส่ per_case) เห็นเฉพาะ field และสูตร global ที่อยู่ก่อนหน้า
- per_case:true คำนวณแยกทุกเคส เห็น field, column ของ case_table, และสูตร per_case ก่อนหน้าในเคสเดียวกัน
- สูตร global ที่อยู่หลังสุด อ้างผลของเคสได้ด้วย <caseId>.<key> เช่น low.pv
- รูปแบบ { module, args, into } มีอยู่ในระบบ แต่ห้ามใช้ เว้นแต่ถูกสั่งให้ใช้
- show:false = คำนวณแต่ไม่แสดงในตารางผล
- format: { type, dp?, signed?, suffix? }
  type ใช้ได้เฉพาะ int | number | million | thousand | percent | text
  int = จำนวนเต็มมี comma, number = ทศนิยม dp ตำแหน่ง, million = หารล้าน, thousand = หารพัน,
  percent = ตัวเลขเปอร์เซ็นต์ (ไม่คูณ 100 ให้), text = ข้อความ
  dp = จำนวนทศนิยม (ตัดศูนย์ท้ายให้อัตโนมัติ), signed:true = ใส่ + หน้าเลขบวก, suffix = หน่วยต่อท้าย เช่น " บาท" หรือ "%"

expr (นิพจน์):
- ใช้ได้: ตัวเลข (ห้ามมี comma ในตัวเลข), ตัวแปร, + - * / % ^, เปรียบเทียบ < <= > >= == !=, && || !, วงเล็บ, ข้อความใน "..." (double quote)
- ฟังก์ชันที่ใช้ได้เท่านั้น: round(x,dp) floor ceil abs min max sum avg if(cond,a,b)
- ห้ามใช้ฟังก์ชันอื่น ห้ามใช้ ; หรือ [ ] หรือ { }
- เปอร์เซ็นต์ในช่องกรอกเป็นเลขเต็ม (เช่น 30 แทน 30%) ต้องหาร 100 เองในสูตร
- ถ้าโพสต์แสดงตัวเลขที่ปัดแล้วระหว่างทางและใช้ต่อ ให้ใช้ round() ในสูตรให้ตรงกับโพสต์

summary (ไม่บังคับ):
- สูตรที่มีเคส: { "per_case_key": "<key ของสูตร per_case>" } สรุปเป็น "<ชื่อเคส> <ผล>" ต่อกันด้วย " · "
- สูตรที่ไม่มีเคส: { "key": "<key ของสูตร global>" } สรุปเป็นข้อความผลของสูตรนั้น เช่นคำตัดสิน

notes: array ของข้อความสั้นแสดงใต้ผลคำนวณ
narrative_fields: ช่องให้ผู้เขียนกรอกข้อมูลเล่าเรื่อง { key, label, hint? }
- ถ้าโพสต์ไม่ได้ต้องการอย่างอื่น ให้ใช้ 4 ช่องมาตรฐาน:
  hook "มุม Hook", gossip "ข่าว/ซุบซิบโครงการ", audience "กลุ่มลูกค้า/บริบทตลาด", assumption_reasons "เหตุผลของสมมติฐาน"
tone_options: array ของ { key, label, instruction } ตัวเลือกเสริมโทน (ติ๊กแล้ว instruction ถูกใส่ใน prompt)
sections: array ของ { id, title, guide } เรียงตามโครงเรื่องของโพสต์ title ภาษาไทย guide ประโยคเดียว

checks: array ของ { key, keywords, per_case? } = ตัวเลขที่ต้องตรวจในโพสต์
- key ต้องเป็น key ของ formula ที่มีอยู่ และ per_case ต้องตรงกับสูตรนั้น (per_case ใช้กับสูตร per_case เท่านั้น)
- keywords = คำที่ปรากฏในโพสต์ก่อนตัวเลขนั้น ในบรรทัดเดียวกัน (ตัวเลขต้องอยู่หลังคำ)
- ถ้ามี cases ต้องมี markers ให้ครบเพื่อให้ระบบแยกช่วงของแต่ละเคสในโพสต์ได้

sample_inputs: ค่า input ที่พบในโพสต์ต้นแบบ รูปแบบเดียวกับที่แอปเก็บ
- number เป็นตัวเลข, text เป็นข้อความ, rai_ngan_wa เป็น string "ไร่-งาน-วา" เช่น "1-1-81.7"
- comps_table เป็น [{ "name": "...", "price_per_sqm": 0 }], case_table เป็น { "<caseId>": { "<columnKey>": ค่า } }`;
