// One renderer per spec field type. Values live in `inputs` (mutated in place); ctx.onChange() fires after edits.
import { h, clear } from './dom.js';
import { api } from './api.js';
import { formatValue } from './engine/index.js';

function labelText(field) {
  return field.label + (field.required ? ' *' : '');
}

function parseNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const s = String(v === undefined || v === null ? '' : v).replace(/,/g, '').trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isNaN(n) ? undefined : n;
}

function wrapField(field, ctx, body, extraClass) {
  const wrap = h('div', { class: 'field' + (extraClass ? ' ' + extraClass : ''), 'data-key': field.key }, body);
  if (ctx.missing && ctx.missing.has(field.key)) wrap.classList.add('field-missing');
  return wrap;
}

function touch(ctx, field, node) {
  if (node) {
    const wrap = node.closest ? node.closest('.field') : null;
    if (wrap) wrap.classList.remove('field-missing');
  }
  if (ctx.missing) ctx.missing.delete(field.key);
  ctx.onChange();
}

function textField(field, ctx) {
  const id = 'f-' + field.key;
  const input = h('input', {
    type: 'text', class: 'input', id, autocomplete: 'off', value: ctx.inputs[field.key] || '',
    oninput: () => { ctx.inputs[field.key] = input.value; touch(ctx, field, input); },
  });
  return wrapField(field, ctx, [h('label', { class: 'field-label', for: id }, labelText(field)), input]);
}

function numberField(field, ctx) {
  const id = 'f-' + field.key;
  const v = ctx.inputs[field.key];
  const input = h('input', {
    type: 'text', inputmode: 'decimal', class: 'input num', id, autocomplete: 'off',
    value: v === undefined || v === null ? '' : String(v),
    oninput: () => { ctx.inputs[field.key] = input.value; touch(ctx, field, input); },
  });
  return wrapField(field, ctx, [
    h('label', { class: 'field-label', for: id }, labelText(field)),
    h('div', { class: 'input-row' }, input, field.unit ? h('span', { class: 'unit' }, field.unit) : null),
  ]);
}

function raiField(field, ctx) {
  if (!ctx.inputs[field.key] || typeof ctx.inputs[field.key] !== 'object') {
    ctx.inputs[field.key] = { rai: '', ngan: '', wa: '' };
  }
  const val = ctx.inputs[field.key];
  const parts = [['rai', 'ไร่'], ['ngan', 'งาน'], ['wa', 'วา']].map(([k, lab]) => {
    const id = `f-${field.key}-${k}`;
    const input = h('input', {
      type: 'text', inputmode: 'decimal', class: 'input num', id, autocomplete: 'off',
      value: val[k] === undefined || val[k] === null ? '' : String(val[k]),
      oninput: () => { val[k] = input.value; touch(ctx, field, input); },
    });
    return h('div', { class: 'rnw-cell' }, h('label', { class: 'rnw-label', for: id }, lab), input);
  });
  return wrapField(field, ctx, [h('div', { class: 'field-label' }, labelText(field)), h('div', { class: 'rnw-row' }, parts)]);
}

function caseTableField(field, ctx) {
  const table = ctx.inputs[field.key] && typeof ctx.inputs[field.key] === 'object' ? ctx.inputs[field.key] : {};
  ctx.inputs[field.key] = table;
  const cols = field.columns || [];
  const rows = (ctx.spec.cases || []).map((c) => {
    if (!table[c.id] || typeof table[c.id] !== 'object') table[c.id] = {};
    const cells = cols.map((col) => {
      const id = `f-${field.key}-${c.id}-${col.key}`;
      const cur = table[c.id][col.key];
      const input = h('input', {
        type: 'text', inputmode: 'decimal', class: 'input num', id, autocomplete: 'off',
        'aria-label': `${c.label} ${col.label}`,
        value: cur === undefined || cur === null ? '' : String(cur),
        oninput: () => { table[c.id][col.key] = input.value; touch(ctx, field, input); },
      });
      return h('td', null, h('div', { class: 'input-row' }, input, col.unit ? h('span', { class: 'unit' }, col.unit) : null));
    });
    return h('tr', null, h('th', { scope: 'row' }, c.label), cells);
  });
  return wrapField(field, ctx, [
    h('div', { class: 'field-label' }, labelText(field)),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'grid' },
        h('thead', null, h('tr', null, h('th', null, 'เคส'), cols.map((col) => h('th', null, col.label)))),
        h('tbody', null, rows)))
  ]);
}

// ---- comps table + library picker ----

function openCompsSheet(ctx, lib, onPick) {
  const searchId = 'comps-search';
  const listEl = h('div', { class: 'sheet-list' });
  const search = h('input', {
    type: 'search', class: 'input', id: searchId, placeholder: 'ค้นชื่อโครงการหรือทำเล',
    'aria-label': 'ค้นคลัง Comps', autocomplete: 'off',
    oninput: () => renderList(),
  });
  const overlay = h('div', { class: 'sheet-overlay' });
  function close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function renderList() {
    clear(listEl);
    if (lib.status === 'loading') { listEl.appendChild(h('p', { class: 'muted' }, 'กำลังโหลด...')); return; }
    if (lib.status === 'error') {
      listEl.appendChild(h('p', { class: 'form-error' }, 'โหลดคลัง Comps ไม่สำเร็จ'));
      return;
    }
    const q = search.value.trim().toLowerCase();
    const items = lib.items.filter((c) => !q
      || String(c.project_name || '').toLowerCase().includes(q)
      || String(c.location || '').toLowerCase().includes(q));
    if (!items.length) { listEl.appendChild(h('p', { class: 'muted' }, 'ไม่พบรายการ')); return; }
    for (const c of items) {
      listEl.appendChild(h('button', {
        type: 'button', class: 'sheet-item',
        onclick: () => { onPick({ name: String(c.project_name || ''), price_per_sqm: String(c.price_per_sqm === undefined ? '' : c.price_per_sqm) }); close(); },
      },
      h('span', { class: 'sheet-item-name' }, c.project_name || ''),
      c.location ? h('span', { class: 'muted' }, c.location) : null,
      h('span', { class: 'num' }, String(c.price_per_sqm === undefined ? '' : c.price_per_sqm))));
    }
  }
  overlay.appendChild(h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'คลัง Comps' },
    h('div', { class: 'sheet-head' },
      h('h2', null, 'คลัง Comps'),
      h('button', { type: 'button', class: 'btn', onclick: close, 'aria-label': 'ปิด' }, 'ปิด')),
    search, listEl));
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKey);
  renderList();
  lib.onLoaded = renderList;
  search.focus();
}

function compsField(field, ctx) {
  if (!Array.isArray(ctx.inputs[field.key])) ctx.inputs[field.key] = [];
  const rows = ctx.inputs[field.key];
  const lib = ctx.compsLib || (ctx.compsLib = { status: 'loading', items: [], names: new Set(), onLoaded: null });
  if (!lib.started) {
    lib.started = true;
    api('comps.list', {}).then((data) => {
      lib.items = Array.isArray(data) ? data : [];
      lib.names = new Set(lib.items.map((c) => String(c.project_name || '').trim().toLowerCase()));
      lib.status = 'ok';
    }).catch(() => { lib.status = 'error'; }).then(() => {
      if (lib.onLoaded) lib.onLoaded();
      if (lib.refreshAll) lib.refreshAll();
    });
  }

  const body = h('div', { class: 'comps-rows' });
  const statsEl = h('p', { class: 'comps-stats muted' });
  const refreshers = [];
  const savedRows = new WeakSet();

  function updateStats() {
    const prices = rows.map((r) => parseNum(r.price_per_sqm)).filter((n) => n !== undefined);
    clear(statsEl);
    if (!prices.length) { statsEl.appendChild(document.createTextNode('ยังไม่มีราคา')); return; }
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    statsEl.appendChild(document.createTextNode(`${prices.length} โครงการ · เฉลี่ย `));
    statsEl.appendChild(h('span', { class: 'num' }, formatValue(avg, { type: 'thousand', dp: 1, suffix: 'k' })));
  }

  function renderRows() {
    clear(body);
    refreshers.length = 0;
    rows.forEach((row, idx) => {
      const nameIn = h('input', {
        type: 'text', class: 'input', placeholder: 'ชื่อโครงการ', 'aria-label': 'ชื่อโครงการ', autocomplete: 'off',
        value: row.name || '',
        oninput: () => { row.name = nameIn.value; touch(ctx, field, nameIn); refresh(); },
      });
      const priceIn = h('input', {
        type: 'text', inputmode: 'decimal', class: 'input num', placeholder: 'ราคา/ตร.ม.', 'aria-label': 'ราคาต่อตารางเมตร', autocomplete: 'off',
        value: row.price_per_sqm === undefined || row.price_per_sqm === null ? '' : String(row.price_per_sqm),
        oninput: () => { row.price_per_sqm = priceIn.value; touch(ctx, field, priceIn); updateStats(); refresh(); },
      });
      const saveBtn = h('button', { type: 'button', class: 'link-btn' }, 'เก็บเข้าคลัง');
      saveBtn.addEventListener('click', async () => {
        const name = String(row.name || '').trim();
        const price = parseNum(row.price_per_sqm);
        if (!name || price === undefined) return;
        saveBtn.disabled = true;
        try {
          const created = await api('comps.add', { project_name: name, price_per_sqm: price });
          lib.names.add(name.toLowerCase());
          if (created && lib.items) lib.items.unshift(created);
          savedRows.add(row);
        } catch (e) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'เก็บไม่สำเร็จ ลองใหม่';
          return;
        }
        refresh();
      });
      function refresh() {
        const name = String(row.name || '').trim();
        const price = parseNum(row.price_per_sqm);
        const known = name !== '' && (savedRows.has(row) || lib.names.has(name.toLowerCase()));
        saveBtn.hidden = !(name !== '' && price !== undefined);
        if (known) { saveBtn.textContent = 'เก็บแล้ว'; saveBtn.disabled = true; }
        else if (!saveBtn.hidden) { saveBtn.textContent = 'เก็บเข้าคลัง'; saveBtn.disabled = false; }
      }
      refreshers.push(refresh);
      refresh();
      body.appendChild(h('div', { class: 'comps-row' },
        h('div', { class: 'comps-inputs' }, nameIn, priceIn),
        h('div', { class: 'comps-actions' },
          saveBtn,
          h('button', {
            type: 'button', class: 'link-btn danger', 'aria-label': 'ลบแถว',
            onclick: () => { rows.splice(idx, 1); renderRows(); updateStats(); touch(ctx, field, null); },
          }, 'ลบแถว'))));
    });
  }
  lib.refreshAll = () => refreshers.forEach((f) => f());

  renderRows();
  updateStats();
  return wrapField(field, ctx, [
    h('div', { class: 'field-label' }, labelText(field)),
    body,
    statsEl,
    h('div', { class: 'btn-row' },
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => { rows.push({ name: '', price_per_sqm: '' }); renderRows(); updateStats(); touch(ctx, field, null); },
      }, 'เพิ่มแถว'),
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => openCompsSheet(ctx, lib, (row) => { rows.push(row); renderRows(); updateStats(); touch(ctx, field, null); }),
      }, 'เลือกจากคลัง Comps'))
  ]);
}

const RENDERERS = {
  text: textField,
  number: numberField,
  rai_ngan_wa: raiField,
  case_table: caseTableField,
  comps_table: compsField,
};

// ctx: { spec, inputs, onChange, missing:Set }
export function renderFields(ctx) {
  const wrap = h('div', { class: 'fields' });
  for (const field of ctx.spec.fields || []) {
    const fn = RENDERERS[field.type];
    if (fn) wrap.appendChild(fn(field, ctx));
  }
  return wrap;
}
