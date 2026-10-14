// #/style/house (admin): House Style DNA, House examples, whole-folder import.
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import * as store from '../store.js';
import { renderDnaEditor } from '../style/dna-editor.js';
import { renderDnaUpdate } from '../style/dna-update.js';
import { renderExamplesPanel, loadFormats } from '../style/examples-panel.js';

const DEFAULT_FOLDER = '12fdV8uZhCC69RY1jjaCnnUupY_gvDizG';
const NO_ACCESS = 'เปิดโฟลเดอร์ไม่ได้ — ตรวจว่าแชร์ให้ teewangwangland@gmail.com แล้ว';
const FOLDER_ERRORS = ['DOC_NOT_ACCESSIBLE', 'NOT_FOUND', 'SERVER_ERROR'];

export function folderIdOf(input) {
  const s = String(input || '').trim();
  const m = /\/folders\/([a-zA-Z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : null;
}

function importErrorText(e) {
  const code = e && e.code;
  if (code === 'NETWORK') return 'ต่อเซิร์ฟเวอร์ไม่ได้';
  if (FOLDER_ERRORS.includes(code)) return NO_ACCESS;
  return 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}

function folderImport(me) {
  const root = h('div', { class: 'folder-import' });
  const folderIn = h('input', { class: 'input', id: 'fi-folder', type: 'text' });
  folderIn.value = DEFAULT_FOLDER;
  const fmtSel = h('select', { class: 'input', id: 'fi-format' });
  const ownerSel = h('select', { class: 'input', id: 'fi-owner' });
  const status = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btn = h('button', { type: 'button', class: 'btn btn-primary' }, 'เริ่มดูด');

  loadFormats().then((fs) => {
    const published = fs.filter((f) => f.status === 'published');
    const ordered = published.concat(fs.filter((f) => f.status !== 'published'));
    for (const f of ordered) fmtSel.appendChild(h('option', { value: f.format_id }, f.name || f.format_id));
    if (ordered.length) fmtSel.value = ordered[0].format_id;
  }).catch(() => {});
  api('users.list').then((us) => {
    for (const u of Array.isArray(us) ? us : []) ownerSel.appendChild(h('option', { value: u.user_id }, u.display_name || u.user_id));
    if (me && me.user_id) ownerSel.value = me.user_id;
  }).catch(() => {});

  btn.addEventListener('click', async () => {
    err.textContent = '';
    status.textContent = '';
    const folder = folderIdOf(folderIn.value);
    if (!folder) { err.textContent = 'ลิงก์หรือรหัสโฟลเดอร์ไม่ถูกต้อง'; return; }
    if (!fmtSel.value || !ownerSel.value) { err.textContent = 'เลือกรูปแบบและเจ้าของตัวอย่างก่อน'; return; }
    btn.disabled = true;
    let imported = 0;
    let skipped = 0;
    let remaining = false;
    const failed = new Set();
    try {
      for (let round = 0; round < 10; round++) {
        const r = await api('examples.importFolder', { folder_id: folder, format_id: fmtSel.value, owner_user_id: ownerSel.value });
        imported += Number(r && r.imported) || 0;
        skipped += Number(r && r.skipped) || 0;
        remaining = !!(r && r.remaining);
        ((r && r.failed) || []).forEach((n) => failed.add(n));
        status.textContent = `นำเข้าแล้ว ${imported} · ข้าม (ซ้ำ) ${skipped}` + (remaining ? ' · กำลังทำต่อ...' : '');
        if (!remaining) break;
      }
      if (remaining) status.textContent += ' — ยังเหลืออีก กดเริ่มดูดอีกครั้งเพื่อทำต่อ';
      else status.textContent = `เสร็จแล้ว นำเข้าแล้ว ${imported} · ข้าม (ซ้ำ) ${skipped}`;
      // docs the script could not open (e.g. owned by another account and not shared)
      if (failed.size) err.textContent = `อ่านไม่ได้ ${failed.size} ไฟล์: ${[...failed].join(', ')} — ตรวจว่าแชร์ให้ teewangwangland@gmail.com แล้ว`;
    } catch (e) {
      if (e && e.code === 'UNAUTHORIZED') return;
      err.textContent = importErrorText(e);
    }
    btn.disabled = false;
  });

  root.appendChild(h('div', { class: 'fields' },
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'fi-folder' }, 'โฟลเดอร์ (ลิงก์หรือรหัส)'), folderIn),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'fi-format' }, 'รูปแบบ'), fmtSel),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'fi-owner' }, 'เจ้าของตัวอย่าง'), ownerSel),
    h('div', { class: 'btn-row' }, btn), status, err));
  return root;
}

export function renderStyleHouse(el) {
  const me = store.getUser() || {};
  const names = {};
  const editor = renderDnaEditor({
    scope: 'HOUSE', isHouse: true, canEdit: true,
    userName: (id) => names[id] || (id === me.user_id ? me.display_name : id),
  });
  api('users.list').then((us) => {
    for (const u of Array.isArray(us) ? us : []) names[u.user_id] = u.display_name;
    if (editor.state.loaded) editor.reload();
  }).catch(() => {});
  clear(el);
  el.appendChild(h('section', { class: 'screen' },
    h('h1', null, 'House Style'),
    h('section', { class: 'style-section' },
      h('h2', null, 'House Style'),
      editor.el,
      renderDnaUpdate({ scope: 'HOUSE', ownerForExamples: 'HOUSE', isHouse: true, displayName: 'ที่ว่างว่าง', editor })),
    h('section', { class: 'style-section' },
      h('h2', null, 'ตัวอย่างของเพจ (House)'),
      renderExamplesPanel({ owner: 'HOUSE', canManage: true, isAdmin: true })),
    h('section', { class: 'style-section' },
      h('h2', null, 'ดูด Google Doc ทั้งโฟลเดอร์'),
      folderImport(me))
  ));
}
