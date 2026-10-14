// Pure extraction-prompt builder: no DOM, no network.
import { SPEC_SCHEMA_DOC } from './spec-schema-doc.js';

function s(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

export function buildExtractPrompt({ name, formatId, sourcePost, exampleSpec, schemaDoc }) {
  const doc = s(schemaDoc) !== '' ? s(schemaDoc) : SPEC_SCHEMA_DOC;
  const parts = [];
  parts.push([
    '### บทบาท',
    'คุณคือผู้ช่วยถอดโครงสร้างโพสต์วิเคราะห์อสังหาฯ ให้เป็นสเปก JSON สำหรับแอปที่คำนวณตัวเลขด้วยโค้ด',
  ].join('\n'));
  parts.push([
    '### หน้าที่',
    '- หาตัวเลข INPUT ทุกตัวที่ผู้เขียนตั้งสมมติฐานไว้ แล้วทำเป็น fields',
    '- หาตัวเลข DERIVED ทุกตัว แล้วเขียน formulas ที่คำนวณได้ผลเท่ากับโพสต์ทุกขั้น ใช้ round() เมื่อโพสต์แสดงค่าที่ปัดแล้วระหว่างทาง',
    '- ถ้าโพสต์เทียบหลายเคส ให้ทำเป็น cases พร้อม case_table หนึ่งตัว',
    '- ถอดโครงเรื่องทีละส่วนเป็น sections (title ภาษาไทย พร้อม guide หนึ่งบรรทัด)',
    '- ตัวเลขที่ต้องตรวจภายหลังให้ทำเป็น checks โดย keywords คือคำที่ปรากฏในโพสต์ก่อนตัวเลขนั้นในบรรทัดเดียวกัน',
    '- ถ้ามี ให้เพิ่ม tone_options (ช่องติ๊กเสริมโทน) และ notes (ข้อสังเกตใต้ผล)',
    '- ใส่ sample_inputs = ค่า input ที่พบในโพสต์ รูปแบบเดียวกับที่แอปใช้: ช่อง number เป็นตัวเลข, rai_ngan_wa เป็น string "ไร่-งาน-วา", comps_table เป็น [{name, price_per_sqm}], case_table เป็น {caseId:{col:value}}',
  ].join('\n'));
  parts.push(['### กติกาของสเปก', doc].join('\n'));
  if (exampleSpec !== null && exampleSpec !== undefined) {
    parts.push([
      '### ตัวอย่างสเปกที่ใช้งานได้จริง',
      '```json',
      JSON.stringify(exampleSpec, null, 2),
      '```',
    ].join('\n'));
  }
  parts.push([
    '### ข้อมูลรูปแบบใหม่',
    `ชื่อรูปแบบ: ${s(name)}`,
    `id: ${s(formatId)}`,
  ].join('\n'));
  parts.push([
    '### โพสต์ต้นแบบ',
    '<<<โพสต์',
    s(sourcePost),
    'โพสต์>>>',
  ].join('\n'));
  parts.push([
    '### รูปแบบคำตอบ',
    'ตอบเป็น JSON object เดียวในบล็อก ```json เท่านั้น ห้ามมีคำอธิบายนอกบล็อก ใช้ schema_version 1 และ id/name ตามที่ให้ไว้ ต้องมี "sample_inputs"',
  ].join('\n'));
  return parts.join('\n\n') + '\n';
}
