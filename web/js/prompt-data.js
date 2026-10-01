import { api } from './api.js';
import * as store from './store.js';
import { DEFAULT_HOUSE_DNA } from './prompt/house-default.js';

async function safe(promise) {
  try { return { ok: true, value: await promise }; } catch (e) { return { ok: false, value: null }; }
}

function dnaOf(res) {
  if (!res.ok || !res.value) return null;
  let dna = res.value.dna;
  if (typeof dna === 'string') {
    try { dna = JSON.parse(dna); } catch (e) { return null; }
  }
  return dna && typeof dna === 'object' ? dna : null;
}

function newest(res) {
  if (!res.ok || !Array.isArray(res.value) || res.value.length === 0) return null;
  return res.value[0];
}

// Never throws. Each failing part becomes null; `notes` carries non-blocking messages for the UI.
export async function loadPromptContext(formatId, user) {
  const uid = user && user.user_id;
  const [houseRes, personalRes, exHouseRes, exMineRes, meRes] = await Promise.all([
    safe(api('styledna.get', { scope: 'HOUSE' })),
    uid ? safe(api('styledna.get', { scope: uid })) : Promise.resolve({ ok: false, value: null }),
    safe(api('examples.list', { format_id: formatId, owner: 'HOUSE' })),
    uid ? safe(api('examples.list', { format_id: formatId, owner: uid })) : Promise.resolve({ ok: false, value: null }),
    safe(api('auth.me'))
  ]);

  const houseDna = dnaOf(houseRes);
  const house = houseDna || DEFAULT_HOUSE_DNA;
  const personal = dnaOf(personalRes);
  const examples = { house: newest(exHouseRes), mine: newest(exMineRes) };
  const fresh = meRes.ok && meRes.value && meRes.value.user ? meRes.value.user : null;
  const profile = fresh || user || {};
  if (fresh) store.setAuth(store.getToken(), fresh);

  const notes = [];
  if (!houseDna) notes.push('ยังไม่มี House Style ในระบบ — ใช้ค่าเริ่มต้นของเพจ');
  if (!exHouseRes.ok || !exMineRes.ok) notes.push('โหลดตัวอย่างโพสต์ไม่ครบ — prompt อาจไม่มีตัวอย่างบางส่วน');
  else if (!examples.house && !examples.mine) notes.push('ยังไม่มีตัวอย่างโพสต์ของรูปแบบนี้ — prompt จะไม่มีตัวอย่าง');
  if (!meRes.ok) notes.push('โหลดโปรไฟล์ล่าสุดไม่ได้ — ใช้ข้อมูลที่เก็บไว้ในเครื่อง');
  return { house, personal, examples, profile, notes };
}
