// Pure prompt builder: no DOM, no network.
import { formatNumberPart } from '../engine/format.js';
import { DEFAULT_HOUSE_DNA } from './house-default.js';

export const PLAYFULNESS = {
  1: 'จริงจัง ข้อมูลแน่น แทบไม่มีมุก',
  2: 'สุภาพ เป็นกันเอง มุกเล็กน้อย',
  3: 'เป็นกันเอง มีมุกพอประมาณ',
  4: 'ขี้เล่น ภาษาพูด มุกบ่อย',
  5: 'ขี้เล่นสุด แซวได้เต็มที่ แต่ตัวเลขต้องเป๊ะ'
};

function str(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'string') return v.trim();
  return '';
}

function list(v) {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}

function bullets(items) {
  return items.map((x) => '- ' + x);
}

function clampLevel(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 3;
  return Math.min(5, Math.max(1, x));
}

function raiText(raw) {
  if (raw === null || raw === undefined || raw === '') return '';
  if (typeof raw === 'string') return raw.trim() ? raw.trim() + ' ไร่' : '';
  const parts = [raw.rai, raw.ngan, raw.wa];
  if (parts.every((p) => str(p) === '')) return '';
  return parts.map((p) => (str(p) === '' ? '0' : str(p))).join('-') + ' ไร่';
}

function priceText(v) {
  const s = str(v);
  if (s === '') return '';
  const n = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(n)) return '';
  return formatNumberPart(n, { type: 'number', dp: 2, trim: true });
}

export function buildWritePrompt({ spec, result, inputs, narrative, tone, house, personal, profile, examples }) {
  spec = spec || {};
  result = result || { global: [], cases: [], summary: '' };
  inputs = inputs || {};
  narrative = narrative || {};
  tone = tone || {};
  profile = profile || {};
  const hs = house || DEFAULT_HOUSE_DNA;
  const ps = personal || null;
  const ex = examples || {};
  const name = str(profile.display_name);
  const level = clampLevel(tone.playfulness);
  const sections = [];

  // 1. role
  sections.push([
    '### บทบาท',
    `คุณคือผู้ช่วยเขียนโพสต์ Facebook ภาษาไทยของเพจ "ที่ว่างว่าง" เขียนในนามของ ${name}`,
    'งานของคุณคือ "เล่าเรื่อง" จากตัวเลขที่คำนวณไว้แล้วเท่านั้น'
  ]);

  // 2. number rules
  sections.push([
    '### กฎตัวเลข (สำคัญที่สุด)',
    '- ตัวเลขทุกตัวด้านล่างคำนวณแล้ว ห้ามแก้ ห้ามคำนวณใหม่ ห้ามปัดเศษใหม่ ห้ามเพิ่มตัวเลขที่ไม่มีในรายการ',
    ...bullets(list(hs.number_rules))
  ]);

  // 3. house style
  const s3 = ['### สไตล์ของเพจ (House Style)'];
  if (str(hs.voice)) s3.push(str(hs.voice));
  if (list(hs.do).length) s3.push('ควรทำ:', ...bullets(list(hs.do)));
  if (list(hs.dont).length) s3.push('ห้าม:', ...bullets(list(hs.dont)));
  sections.push(s3);

  // 4. personal style
  const s4 = [`### สไตล์ของผู้เขียน (${name})`];
  if (ps && str(ps.voice)) s4.push(str(ps.voice));
  s4.push(`ระดับความขี้เล่น: ${level}/5 — ${PLAYFULNESS[level]}`);
  const catchAll = [str(profile.catchphrases), ...list(ps && ps.signature_phrases)].filter(Boolean);
  if (catchAll.length) s4.push('คำติดปาก: ' + catchAll.join(', '));
  const avoid = [str(profile.avoid_list), ...list(ps && ps.dont)].filter(Boolean);
  if (avoid.length) s4.push('สิ่งที่ไม่ใช้: ' + avoid.join(', '));
  if (ps && list(ps.do).length) s4.push(...bullets(list(ps.do)));
  sections.push(s4);

  // 5. examples
  const exLines = [];
  if (ex.house && str(ex.house.body)) {
    exLines.push(`--- ตัวอย่างจากเพจ: ${str(ex.house.title)} ---`, str(ex.house.body));
  }
  if (ex.mine && str(ex.mine.body)) {
    exLines.push(`--- ตัวอย่างของ ${name}: ${str(ex.mine.title)} ---`, str(ex.mine.body));
  }
  if (exLines.length) {
    sections.push(['### ตัวอย่างโพสต์ (ใช้ดูสำนวนเท่านั้น ห้ามลอกตัวเลขจากตัวอย่าง)', ...exLines]);
  }

  // 6. project info
  const s6 = ['### ข้อมูลโครงการ'];
  for (const f of spec.fields || []) {
    if (f.type !== 'text') continue;
    const v = str(inputs[f.key]);
    if (v) s6.push(`${str(f.label)}: ${v}`);
  }
  sections.push(s6);

  // 7. computed numbers
  const s7 = ['### ตัวเลขที่คำนวณแล้ว (ห้ามแก้ ห้ามคำนวณใหม่)'];
  for (const f of spec.fields || []) {
    if (f.type === 'number') {
      let v = str(inputs[f.key]);
      if (v === '' && f.default !== undefined) v = str(f.default);
      // show plain digit strings with thousands separators so they read like the computed numbers
      if (/^\d{4,}(\.\d+)?$/.test(v)) v = v.replace(/^\d+/, (d) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
      if (v) s7.push(`${str(f.label)}: ${v}`);
    } else if (f.type === 'rai_ngan_wa') {
      const t = raiText(inputs[f.key]);
      if (t) s7.push(`${str(f.label)}: ${t}`);
    } else if (f.type === 'comps_table') {
      const rows = Array.isArray(inputs[f.key]) ? inputs[f.key] : [];
      for (const r of rows) {
        const price = priceText(r && r.price_per_sqm);
        if (!price) continue;
        const nm = str(r.name);
        s7.push(`Comps: ${nm ? nm + ' ' : ''}${price} บาท/ตร.ม.`);
      }
    }
  }
  for (const g of result.global || []) s7.push(`${str(g.label)}: ${str(g.text)}`);
  for (const c of result.cases || []) {
    s7.push(`[${str(c.label)}]`);
    for (const r of c.rows || []) s7.push(`- ${str(r.label)}: ${str(r.text)}`);
  }
  s7.push(`สรุป: ${str(result.summary)}`);
  sections.push(s7);

  // 8. narrative
  const s8 = ['### วัตถุดิบเล่าเรื่อง'];
  for (const f of spec.narrative_fields || []) {
    const v = str(narrative[f.key]);
    if (v) s8.push(`${str(f.label)}: ${v}`);
  }
  sections.push(s8);

  // 9. outline
  const s9 = ['### โครงเรื่อง (เขียนตามลำดับนี้ ไม่ต้องใส่หัวข้อช่วง)'];
  (spec.sections || []).forEach((s, i) => {
    const guide = str(s.guide);
    s9.push(`${i + 1}. ${str(s.title)}${guide ? ' — ' + guide : ''}`);
  });
  sections.push(s9);

  // 10. extra instructions
  const picked = list(tone.options);
  const ticked = (spec.tone_options || []).filter((o) => picked.includes(o.key));
  if (ticked.length) {
    const s10 = ['### คำสั่งเพิ่มเติม'];
    for (const o of ticked) s10.push('- ' + str(o.instruction));
    if (ticked.some((o) => /hashtag/i.test(str(o.instruction)))) {
      s10.push('Hashtag ประจำเพจ: ' + list(hs.hashtags).join(' '));
    }
    sections.push(s10);
  }

  // 11. answer format
  const s11 = [
    '### รูปแบบคำตอบ',
    'ตอบเป็นข้อความโพสต์พร้อมโพสต์อย่างเดียว ภาษาไทย ไม่ต้องอธิบาย ไม่ต้องใช้ Markdown ไม่ต้องใส่หัวข้อ ###'
  ];
  if ((spec.cases || []).length) {
    s11.push(`เมื่อพูดถึงตัวเลขของแต่ละเคส ให้ขึ้นต้นช่วงนั้นด้วยชื่อเคส (${spec.cases.map((c) => str(c.label)).join(' / ')}) เพื่อให้ระบบตรวจตัวเลขได้`);
  }
  sections.push(s11);

  return sections
    .map((s) => s.join('\n'))
    .join('\n\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
