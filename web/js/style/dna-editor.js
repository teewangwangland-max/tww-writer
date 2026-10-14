// Shared: current Style DNA view, manual edit, version history + rollback.
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import { thaiShortDate } from '../format-th.js';
import { DEFAULT_HOUSE_DNA } from '../prompt/house-default.js';

export const ERR_TEXT = {
  NETWORK: 'ต่อเซิร์ฟเวอร์ไม่ได้',
  FORBIDDEN: 'ไม่มีสิทธิ์ทำรายการนี้',
  NOT_FOUND: 'ไม่พบข้อมูล',
  BAD_INPUT: 'ข้อมูลไม่ถูกต้อง',
  DOC_NOT_ACCESSIBLE: 'เปิด Google Doc ไม่ได้ — ตรวจว่าแชร์ให้ teewangwangland@gmail.com แล้ว',
};
export function errMsg(e) {
  return ERR_TEXT[e && e.code] || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง';
}

export const SECTIONS = [
  { key: 'voice', label: 'น้ำเสียง', kind: 'text', houseOnly: false },
  { key: 'number_rules', label: 'กฎตัวเลข', kind: 'list', houseOnly: true },
  { key: 'hashtags', label: 'Hashtag ประจำเพจ', kind: 'list', houseOnly: true },
  { key: 'do', label: 'ควรทำ', kind: 'list', houseOnly: false },
  { key: 'dont', label: 'ห้าม', kind: 'list', houseOnly: false },
  { key: 'signature_phrases', label: 'วลีประจำตัว', kind: 'list', houseOnly: false },
];

function asDna(v) {
  let x = v;
  if (typeof x === 'string') {
    try { x = JSON.parse(x); } catch (e) { return {}; }
  }
  return x && typeof x === 'object' && !Array.isArray(x) ? x : {};
}
function listOf(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim() !== '') : [];
}

export function linesToList(text) {
  const seen = new Set();
  const out = [];
  for (const l of String(text || '').split(/\r?\n/)) {
    const t = l.trim();
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out;
}

export function renderDnaEditor({ scope, isHouse, canEdit, userName }) {
  const root = h('div', { class: 'dna-editor' });
  const state = { version: null, dna: {}, current: null, history: [], loaded: false };
  const listeners = [];
  let editing = false;
  let message = '';
  let confirmV = null;

  function nameOf(id) { return userName ? userName(id) : id; }
  function sections() { return SECTIONS.filter((s) => isHouse || !s.houseOnly); }

  async function reload() {
    clear(root);
    root.appendChild(h('p', { class: 'muted' }, 'กำลังโหลด...'));
    try {
      const [cur, hist] = await Promise.all([
        api('styledna.get', { scope }),
        api('styledna.history', { scope }),
      ]);
      state.current = cur || null;
      state.history = Array.isArray(hist) ? hist : [];
      state.version = cur ? cur.version : null;
      state.dna = cur ? asDna(cur.dna) : (isHouse ? DEFAULT_HOUSE_DNA : {});
      state.loaded = true;
      editing = false;
      confirmV = null;
      draw();
      for (const fn of listeners) fn(state);
    } catch (e) {
      if (e && e.code === 'UNAUTHORIZED') return;
      clear(root);
      root.appendChild(h('div', { class: 'empty' },
        h('p', null, 'โหลด Style DNA ไม่สำเร็จ: ' + errMsg(e)),
        h('button', { type: 'button', class: 'btn', onclick: reload }, 'ลองใหม่')));
    }
  }

  function viewSections() {
    const box = h('div', { class: 'dna-sections' });
    for (const s of sections()) {
      const v = state.dna[s.key];
      let body;
      if (s.kind === 'text') {
        body = typeof v === 'string' && v ? h('p', { class: 'dna-text' }, v) : h('p', { class: 'muted' }, 'ยังไม่มี');
      } else {
        const items = listOf(v);
        body = items.length
          ? h('ul', { class: 'info-list' }, items.map((x) => h('li', null, x)))
          : h('p', { class: 'muted' }, 'ยังไม่มี');
      }
      box.appendChild(h('div', { class: 'dna-section' }, h('h3', { class: 'sub-h' }, s.label), body));
    }
    return box;
  }

  function editForm() {
    const inputs = {};
    const form = h('div', { class: 'dna-form' });
    for (const s of sections()) {
      const id = `dna-${scope}-${s.key}`;
      const ta = h('textarea', { class: 'input', id, rows: s.kind === 'text' ? '3' : '4' });
      ta.value = s.kind === 'text' ? (typeof state.dna.voice === 'string' ? state.dna.voice : '') : listOf(state.dna[s.key]).join('\n');
      inputs[s.key] = ta;
      form.appendChild(h('div', { class: 'field' },
        h('label', { class: 'field-label', for: id }, s.kind === 'list' ? `${s.label} (หนึ่งรายการต่อบรรทัด)` : s.label), ta));
    }
    const clId = `dna-${scope}-changelog`;
    const cl = h('input', { class: 'input', id: clId, type: 'text', maxlength: '500', placeholder: 'เช่น ปรับน้ำเสียงให้เป็นกันเองขึ้น' });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const save = h('button', { type: 'button', class: 'btn btn-primary' }, 'บันทึกการเปลี่ยนแปลง');
    save.addEventListener('click', async () => {
      err.textContent = '';
      const changelog = cl.value.trim();
      if (!changelog) { err.textContent = 'กรุณากรอกบันทึกการเปลี่ยนแปลง (changelog)'; return; }
      const dna = {};
      const v = inputs.voice.value.trim();
      if (v) dna.voice = v;
      for (const s of sections()) if (s.kind === 'list') dna[s.key] = linesToList(inputs[s.key].value);
      save.disabled = true;
      try {
        const saved = await api('styledna.save', { scope, dna, changelog, source_example_ids: [] });
        message = `บันทึก v${saved && saved.version !== undefined ? saved.version : '?'} แล้ว`;
        await reload();
      } catch (e) {
        save.disabled = false;
        if (e && e.code === 'UNAUTHORIZED') return;
        err.textContent = errMsg(e);
      }
    });
    form.appendChild(h('div', { class: 'field' },
      h('label', { class: 'field-label', for: clId }, 'บันทึกการเปลี่ยนแปลง (changelog)'), cl));
    form.appendChild(err);
    form.appendChild(h('div', { class: 'btn-row' }, save,
      h('button', { type: 'button', class: 'btn', onclick: () => { editing = false; draw(); } }, 'ยกเลิก')));
    return form;
  }

  function rollbackConfirm(v, nextV) {
    const err = h('span', { class: 'form-error', role: 'alert' });
    const yes = h('button', { type: 'button', class: 'btn btn-primary' }, 'ยืนยัน');
    yes.addEventListener('click', async () => {
      yes.disabled = true;
      try {
        await api('styledna.rollback', { scope, to_version: v.version });
        message = `ย้อนกลับไปใช้ v${v.version} แล้ว`;
        await reload();
      } catch (e) {
        if (e && e.code === 'UNAUTHORIZED') return;
        err.textContent = errMsg(e);
        yes.disabled = false;
      }
    });
    return h('div', { class: 'confirm-inline' },
      h('span', null, `จะสร้าง v${nextV} ที่เหมือน v${v.version} — ยืนยัน?`),
      yes,
      h('button', { type: 'button', class: 'btn', onclick: () => { confirmV = null; draw(); } }, 'ยกเลิก'),
      err);
  }

  function historyList() {
    const wrap = h('div', { class: 'version-list' });
    if (state.history.length === 0) {
      wrap.appendChild(h('p', { class: 'muted' }, 'ยังไม่มีประวัติเวอร์ชัน'));
      return wrap;
    }
    const nextV = Number(state.history[0].version) + 1;
    for (const v of state.history) {
      const isCurrent = Number(v.version) === Number(state.version);
      const log = String(v.changelog || '');
      const long = log.length > 200;
      const logEl = h('p', { class: 'version-log' }, long ? log.slice(0, 200) + '...' : log);
      const parts = [
        h('div', { class: 'card-meta' },
          h('span', { class: 'num' }, 'v' + v.version),
          h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
          h('span', { class: 'num' }, thaiShortDate(v.created_at)),
          h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
          h('span', null, nameOf(v.created_by)),
          isCurrent ? h('span', { class: 'pill' }, 'ปัจจุบัน') : null),
        logEl,
      ];
      if (long) {
        let open = false;
        const t = h('button', { type: 'button', class: 'link-btn' }, 'อ่านทั้งหมด');
        t.addEventListener('click', () => {
          open = !open;
          logEl.textContent = open ? log : log.slice(0, 200) + '...';
          t.textContent = open ? 'ย่อ' : 'อ่านทั้งหมด';
        });
        parts.push(t);
      }
      if (canEdit && !isCurrent) {
        if (confirmV === v.version) {
          parts.push(rollbackConfirm(v, nextV));
        } else {
          parts.push(h('div', { class: 'btn-row' },
            h('button', { type: 'button', class: 'btn', onclick: () => { confirmV = v.version; draw(); } }, `ย้อนกลับไปใช้ v${v.version}`)));
        }
      }
      wrap.appendChild(h('div', { class: 'card version-item' }, parts));
    }
    return wrap;
  }

  function draw() {
    clear(root);
    const cur = state.current;
    if (cur) {
      root.appendChild(h('p', { class: 'dna-head' },
        `เวอร์ชันปัจจุบัน v${cur.version} · ${thaiShortDate(cur.created_at)} · โดย ${nameOf(cur.created_by)}`));
    } else if (isHouse) {
      root.appendChild(h('p', { class: 'muted' }, 'ยังไม่มีเวอร์ชันในระบบ — บันทึกครั้งแรกจะเป็น v1'));
    } else {
      root.appendChild(h('p', { class: 'muted' }, 'ยังไม่มี Style DNA ส่วนตัว — บันทึกครั้งแรกจะเป็น v1'));
    }
    if (message) root.appendChild(h('p', { class: 'ok-text', role: 'status', 'aria-live': 'polite' }, message));
    message = '';
    if (editing) {
      root.appendChild(editForm());
    } else {
      root.appendChild(viewSections());
      if (canEdit) {
        root.appendChild(h('div', { class: 'btn-row' },
          h('button', { type: 'button', class: 'btn', onclick: () => { editing = true; draw(); } }, 'แก้เอง')));
      }
    }
    root.appendChild(h('h3', { class: 'sub-h' }, 'ประวัติเวอร์ชัน'));
    root.appendChild(historyList());
  }

  reload();
  return { el: root, state, reload, onLoaded: (fn) => listeners.push(fn) };
}
