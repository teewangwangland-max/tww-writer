// PURE: prompt builder + answer parser + diff for Style DNA updates. No DOM, no network.
import { extractJson } from '../spec-json.js';

export const HOUSE_FIELDS = ['voice', 'number_rules', 'hashtags', 'do', 'dont', 'signature_phrases'];
export const PERSONAL_FIELDS = ['voice', 'do', 'dont', 'signature_phrases'];

const MAX_ITEMS = 30;
const MAX_ITEM_LEN = 300;
const MAX_VOICE = 1000;

export function fieldsFor(isHouse) {
  return isHouse ? HOUSE_FIELDS : PERSONAL_FIELDS;
}

export function buildDnaPrompt({ scope, isHouse, displayName, currentDna, examples }) {
  const whose = isHouse ? 'ของเพจ ที่ว่างว่าง' : `ของ ${displayName || 'นักเขียนคนนี้'}`;
  const fields = fieldsFor(isHouse);
  const out = [];

  out.push('### บทบาท');
  out.push(`คุณคือบรรณาธิการที่สรุปสไตล์การเขียนโพสต์ Facebook ภาษาไทย ${whose}`);
  out.push('');

  out.push('### สไตล์ปัจจุบัน');
  out.push(currentDna && typeof currentDna === 'object' ? JSON.stringify(currentDna, null, 2) : 'ยังไม่มี');
  out.push('');

  out.push('### โพสต์ตัวอย่างใหม่');
  for (const ex of examples || []) {
    out.push(`--- [${ex.example_id}] ${ex.title} ---`);
    out.push(String(ex.body || ''));
    out.push('');
  }

  out.push('### สิ่งที่ต้องทำ');
  out.push('- เก็บสิ่งที่ยังใช้ได้ในสไตล์ปัจจุบันไว้');
  out.push('- เพิ่มสิ่งที่โพสต์ตัวอย่างใหม่แสดงให้เห็น');
  out.push('- ลบเฉพาะสิ่งที่ขัดแย้งกับโพสต์ใหม่อย่างชัดเจนเท่านั้น');
  out.push('- ห้ามใส่ตัวเลขหรือข้อเท็จจริงของโครงการใดโครงการหนึ่งลงในสไตล์ (เช่น ราคา ทำเล ชื่อโครงการ) ให้สรุปเฉพาะวิธีเขียน');
  if (isHouse) {
    out.push('- คง number_rules และ hashtags เดิมไว้ เว้นแต่โพสต์ใหม่เปลี่ยนสิ่งเหล่านี้อย่างชัดเจน');
  } else {
    out.push('- ใช้เฉพาะฟิลด์ที่ระบุในรูปแบบคำตอบเท่านั้น');
  }
  out.push('');

  out.push('### รูปแบบคำตอบ');
  out.push('ตอบเป็น ```json block เดียวเท่านั้น ไม่มีข้อความอื่นนอก block:');
  out.push('```json');
  out.push('{ "dna": { ...fields... }, "changelog": [ { "example_id": "...", "learned": "..." } ] }');
  out.push('```');
  out.push(`fields ที่ใช้ได้: ${fields.join(', ')}`);
  out.push('- voice เป็นข้อความ ส่วนฟิลด์อื่นเป็นอาเรย์ของข้อความ');
  out.push('- changelog ระบุว่าเรียนรู้อะไรจากโพสต์ไหน (ใช้ example_id ตามที่ให้ไว้)');
  return out.join('\n');
}

function cleanList(v, name) {
  if (!Array.isArray(v)) return { error: `${name} ต้องเป็นอาเรย์ของข้อความ` };
  const seen = new Set();
  const list = [];
  for (const item of v) {
    if (typeof item !== 'string') return { error: `${name} ต้องเป็นอาเรย์ของข้อความ` };
    const t = item.trim();
    if (t === '') continue;
    if (t.length > MAX_ITEM_LEN) return { error: `${name}: มีรายการยาวเกิน ${MAX_ITEM_LEN} ตัวอักษร` };
    if (seen.has(t)) continue;
    seen.add(t);
    list.push(t);
  }
  if (list.length > MAX_ITEMS) return { error: `${name}: มีเกิน ${MAX_ITEMS} รายการ` };
  return { list };
}

export function parseDnaAnswer(text, { isHouse, titleMap } = {}) {
  const r = extractJson(text);
  if (!r.ok) return { ok: false, error: 'อ่าน JSON ไม่ได้: ' + r.error };
  const obj = r.value;
  if (!obj.dna || typeof obj.dna !== 'object' || Array.isArray(obj.dna)) {
    return { ok: false, error: 'ไม่พบ "dna" ที่เป็น object ในคำตอบ' };
  }
  if (!Array.isArray(obj.changelog) || obj.changelog.length === 0) {
    return { ok: false, error: 'ไม่พบ "changelog" (ต้องเป็นอาเรย์ที่ไม่ว่าง)' };
  }

  const dna = {};
  for (const f of fieldsFor(isHouse)) {
    if (obj.dna[f] === undefined) continue;
    if (f === 'voice') {
      if (typeof obj.dna.voice !== 'string') return { ok: false, error: 'voice ต้องเป็นข้อความ' };
      const v = obj.dna.voice.trim();
      if (v.length > MAX_VOICE) return { ok: false, error: `voice ยาวเกิน ${MAX_VOICE} ตัวอักษร` };
      if (v) dna.voice = v;
    } else {
      const c = cleanList(obj.dna[f], f);
      if (c.error) return { ok: false, error: c.error };
      dna[f] = c.list;
    }
  }

  const learned = [];
  for (const e of obj.changelog) {
    if (!e || typeof e !== 'object') continue;
    const id = typeof e.example_id === 'string' ? e.example_id.trim() : '';
    const l = typeof e.learned === 'string' ? e.learned.trim() : '';
    if (!l) continue;
    learned.push({ example_id: id, learned: l });
  }
  if (learned.length === 0) return { ok: false, error: '"changelog" ไม่มีรายการที่ใช้ได้ (ต้องมี learned)' };

  const changelogText = learned
    .map((e) => `- ${(titleMap && titleMap[e.example_id]) || e.example_id || 'ไม่ระบุโพสต์'}: ${e.learned}`)
    .join('\n');
  return { ok: true, dna, changelogText, learned };
}

function asList(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

export function diffDna(oldDna, newDna) {
  const o = oldDna && typeof oldDna === 'object' ? oldDna : {};
  const n = newDna && typeof newDna === 'object' ? newDna : {};
  const out = [];
  for (const field of HOUSE_FIELDS) {
    if (field === 'voice') {
      const a = typeof o.voice === 'string' ? o.voice : '';
      const b = typeof n.voice === 'string' ? n.voice : '';
      out.push({ field, added: [], removed: [], changed: a !== b });
      continue;
    }
    const a = asList(o[field]);
    const b = asList(n[field]);
    const added = b.filter((x) => !a.includes(x));
    const removed = a.filter((x) => !b.includes(x));
    out.push({ field, added, removed, changed: added.length > 0 || removed.length > 0 });
  }
  return out;
}
