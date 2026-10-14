// Shared: example list + add / import Doc / hide / change format / promote to House.
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import { thaiShortDate } from '../format-th.js';
import { errMsg } from './dna-editor.js';

const SOURCE_LABEL = {
  post: 'จากโพสต์',
  doc: 'จาก Google Doc',
  manual: 'พิมพ์เอง',
  promoted: 'ยกเป็นตัวอย่างของเพจ',
};

let formatsPromise = null;
export function loadFormats() {
  if (!formatsPromise) {
    formatsPromise = api('formats.list').then((l) => (Array.isArray(l) ? l : [])).catch((e) => {
      formatsPromise = null;
      throw e;
    });
  }
  return formatsPromise;
}

export function renderExamplesPanel({ owner, canManage, isAdmin }) {
  const root = h('div', { class: 'examples-panel' });
  const listEl = h('div', { class: 'list' });
  const state = { formats: [], filter: '', expanded: new Set(), msg: '' };
  const msgEl = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const filterSel = h('select', { class: 'input', id: `exf-${owner}`, 'aria-label': 'กรองตามรูปแบบ' });
  filterSel.addEventListener('change', () => { state.filter = filterSel.value; load(); });

  function formatName(id) {
    if (!id) return 'ไม่ระบุรูปแบบ';
    const f = state.formats.find((x) => x.format_id === id);
    return (f && f.name) || id;
  }

  function formatSelect(id, value, includeBlank) {
    const sel = h('select', { class: 'input', id, 'aria-label': 'รูปแบบ' });
    if (includeBlank) sel.appendChild(h('option', { value: '' }, 'ไม่ระบุรูปแบบ'));
    for (const f of state.formats) sel.appendChild(h('option', { value: f.format_id }, f.name || f.format_id));
    sel.value = value || '';
    return sel;
  }

  function fillFilter() {
    clear(filterSel);
    filterSel.appendChild(h('option', { value: '' }, 'ทุกรูปแบบ'));
    for (const f of state.formats) filterSel.appendChild(h('option', { value: f.format_id }, f.name || f.format_id));
    filterSel.value = state.filter;
  }

  async function act(fn, okMsg) {
    state.msg = '';
    msgEl.textContent = '';
    try {
      await fn();
      state.msg = okMsg || '';
      await load();
      msgEl.textContent = state.msg;
    } catch (e) {
      if (e && e.code === 'UNAUTHORIZED') return;
      msgEl.textContent = e && e.code === 'DUP' ? 'เป็นตัวอย่างของเพจแล้ว' : errMsg(e);
    }
  }

  async function promote(ex, btn) {
    btn.disabled = true;
    await act(async () => {
      const existing = await api('examples.list', { owner: 'HOUSE', format_id: ex.format_id, include_hidden: true });
      if ((Array.isArray(existing) ? existing : []).some((e) => e.source_ref === ex.example_id)) {
        throw { code: 'DUP' };
      }
      await api('examples.add', {
        owner: 'HOUSE', format_id: ex.format_id, title: ex.title, body: ex.body,
        source: 'promoted', source_ref: ex.example_id,
      });
    }, 'ยกเป็นตัวอย่างของเพจแล้ว');
    btn.disabled = false;
  }

  function card(ex, promotedIds) {
    const active = ex.active !== false;
    const body = String(ex.body || '');
    const open = state.expanded.has(ex.example_id);
    const long = body.length > 160;
    const bodyEl = h('p', { class: open ? 'post-body' : 'card-summary' }, open || !long ? body : body.slice(0, 160) + '...');
    const parts = [
      h('h3', { class: 'card-title' }, ex.title),
      h('div', { class: 'card-meta' },
        h('span', null, formatName(ex.format_id)),
        h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
        h('span', null, SOURCE_LABEL[ex.source] || ex.source || ''),
        h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
        h('span', { class: 'num' }, thaiShortDate(ex.created_at)),
        active ? null : h('span', { class: 'pill' }, 'ซ่อนอยู่')),
      bodyEl,
    ];
    if (long) {
      parts.push(h('div', { class: 'btn-row' }, h('button', {
        type: 'button', class: 'link-btn',
        onclick: () => { if (open) state.expanded.delete(ex.example_id); else state.expanded.add(ex.example_id); load(true); },
      }, open ? 'ย่อ' : 'อ่านทั้งหมด')));
    }
    if (canManage) {
      const fid = `exfmt-${ex.example_id}`;
      const sel = formatSelect(fid, ex.format_id, true);
      const row = h('div', { class: 'btn-row' },
        h('button', {
          type: 'button', class: 'btn',
          onclick: () => act(() => api('examples.update', { example_id: ex.example_id, active: !active }), active ? 'ซ่อนแล้ว' : 'แสดงแล้ว'),
        }, active ? 'ซ่อน' : 'แสดง'));
      parts.push(row);
      parts.push(h('div', { class: 'field' },
        h('label', { class: 'field-label', for: fid }, 'เปลี่ยนรูปแบบ'),
        h('div', { class: 'input-row' }, sel, h('button', {
          type: 'button', class: 'btn',
          onclick: () => act(() => api('examples.update', { example_id: ex.example_id, format_id: sel.value }), 'เปลี่ยนรูปแบบแล้ว'),
        }, 'บันทึก'))));
      if (isAdmin && owner !== 'HOUSE' && active) {
        if (promotedIds.has(ex.example_id)) {
          parts.push(h('p', { class: 'ok-text' }, 'เป็นตัวอย่างของเพจแล้ว'));
        } else if (!ex.format_id) {
          parts.push(h('p', { class: 'muted' }, 'เลือกรูปแบบก่อน จึงจะยกเป็นตัวอย่างของเพจได้'));
        } else {
          const b = h('button', { type: 'button', class: 'btn' }, 'ใช้เป็นตัวอย่างของเพจ');
          b.addEventListener('click', () => promote(ex, b));
          parts.push(h('div', { class: 'btn-row' }, b));
        }
      }
    }
    return h('div', { class: 'card' + (active ? '' : ' dimmed') }, parts);
  }

  let cache = null;
  async function load(useCache) {
    if (!useCache || !cache) {
      clear(listEl);
      listEl.appendChild(h('p', { class: 'muted' }, 'กำลังโหลด...'));
      try {
        const args = { owner };
        if (state.filter) args.format_id = state.filter;
        if (canManage) args.include_hidden = true;
        const items = await api('examples.list', args);
        let promoted = [];
        if (isAdmin && owner !== 'HOUSE') {
          try { promoted = await api('examples.list', { owner: 'HOUSE', include_hidden: true }); } catch (e) { promoted = []; }
        }
        cache = {
          items: Array.isArray(items) ? items : [],
          promotedIds: new Set((Array.isArray(promoted) ? promoted : []).filter((e) => e.source === 'promoted').map((e) => e.source_ref)),
        };
      } catch (e) {
        if (e && e.code === 'UNAUTHORIZED') return;
        clear(listEl);
        listEl.appendChild(h('div', { class: 'empty' }, h('p', null, 'โหลดตัวอย่างไม่สำเร็จ: ' + errMsg(e)),
          h('button', { type: 'button', class: 'btn', onclick: () => load() }, 'ลองใหม่')));
        return;
      }
    }
    clear(listEl);
    if (cache.items.length === 0) listEl.appendChild(h('p', { class: 'muted' }, 'ยังไม่มีตัวอย่าง'));
    for (const ex of cache.items) listEl.appendChild(card(ex, cache.promotedIds));
  }

  function addArea() {
    const box = h('div', { class: 'add-area' });
    // (a) import from a Google Doc
    const docIn = h('input', { class: 'input', id: `exdoc-${owner}`, type: 'url', placeholder: 'วางลิงก์ Google Doc' });
    const docFmt = formatSelect(`exdocfmt-${owner}`, state.formats[0] && state.formats[0].format_id, false);
    const docMsg = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
    const docBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'ดึงตัวอย่าง');
    docBtn.addEventListener('click', async () => {
      docMsg.textContent = '';
      if (!docIn.value.trim() || !docFmt.value) { docMsg.textContent = 'กรอกลิงก์ Google Doc และเลือกรูปแบบ'; return; }
      docBtn.disabled = true;
      try {
        const r = await api('examples.importDoc', { doc: docIn.value.trim(), format_id: docFmt.value, owner });
        docMsg.textContent = r && r.duplicate ? 'มีตัวอย่างนี้แล้ว' : 'นำเข้าแล้ว';
        if (!(r && r.duplicate)) docIn.value = '';
        await load();
      } catch (e) {
        if (e && e.code === 'UNAUTHORIZED') return;
        docMsg.textContent = errMsg(e);
      }
      docBtn.disabled = false;
    });
    box.appendChild(h('details', { class: 'prompt-details' },
      h('summary', null, 'ดึงจาก Google Doc'),
      h('div', { class: 'fields' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: docIn.id }, 'ลิงก์ Google Doc'), docIn),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: docFmt.id }, 'รูปแบบ'), docFmt),
        h('div', { class: 'btn-row' }, docBtn), docMsg)));

    // (b) manual add
    const tIn = h('input', { class: 'input', id: `ext-${owner}`, type: 'text', maxlength: '200' });
    const bIn = h('textarea', { class: 'input big-text', id: `exb-${owner}`, rows: '8' });
    const fSel = formatSelect(`exf2-${owner}`, state.formats[0] && state.formats[0].format_id, false);
    const addMsg = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
    const addBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'เพิ่มตัวอย่าง');
    addBtn.addEventListener('click', async () => {
      addMsg.textContent = '';
      if (!tIn.value.trim() || !bIn.value.trim() || !fSel.value) { addMsg.textContent = 'กรอกชื่อ เนื้อหา และเลือกรูปแบบ'; return; }
      addBtn.disabled = true;
      try {
        await api('examples.add', { owner, format_id: fSel.value, title: tIn.value.trim(), body: bIn.value });
        tIn.value = ''; bIn.value = '';
        addMsg.textContent = 'เพิ่มแล้ว';
        await load();
      } catch (e) {
        if (e && e.code === 'UNAUTHORIZED') return;
        addMsg.textContent = errMsg(e);
      }
      addBtn.disabled = false;
    });
    box.appendChild(h('details', { class: 'prompt-details' },
      h('summary', null, 'เพิ่มเอง'),
      h('div', { class: 'fields' },
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: tIn.id }, 'ชื่อตัวอย่าง'), tIn),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: bIn.id }, 'เนื้อหาโพสต์'), bIn),
        h('div', { class: 'field' }, h('label', { class: 'field-label', for: fSel.id }, 'รูปแบบ'), fSel),
        h('div', { class: 'btn-row' }, addBtn), addMsg)));
    return box;
  }

  async function init() {
    try { state.formats = await loadFormats(); } catch (e) { state.formats = []; }
    clear(root);
    fillFilter();
    root.appendChild(h('div', { class: 'field' },
      h('label', { class: 'field-label', for: filterSel.id }, 'รูปแบบ'), filterSel));
    root.appendChild(msgEl);
    root.appendChild(listEl);
    if (canManage) root.appendChild(addArea());
    await load();
  }

  root.appendChild(h('p', { class: 'muted' }, 'กำลังโหลด...'));
  init();
  return root;
}
