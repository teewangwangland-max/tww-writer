// Admin: list formats, publish/hide (appends a new version), entry points to the extractor.
import { h, clear } from '../dom.js';
import { api } from '../api.js';
import * as store from '../store.js';

function errText(e) {
  const code = (e && e.code) || 'ERROR';
  return `เกิดข้อผิดพลาด (${code})` + (e && e.message ? ' — ' + e.message : '');
}

export function renderAdminFormats(el) {
  let alive = true;
  const listEl = h('div', { class: 'list', 'aria-live': 'polite' });
  const flashEl = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });

  function flash(text, bad) {
    flashEl.textContent = text;
    flashEl.className = bad ? 'form-error' : 'muted';
  }

  async function changeStatus(f, status) {
    flash('กำลังบันทึก...', false);
    try {
      const data = await api('formats.get', { format_id: f.format_id });
      if (!alive) return;
      if (!data || !data.spec) { flash('ไม่พบสเปกของรูปแบบนี้', true); return; }
      const saved = await api('formats.save', { spec: data.spec, status });
      if (!alive) return;
      store.cacheSet('formats.list', null);
      flash(`บันทึกแล้ว v${saved && saved.version !== undefined ? saved.version : '?'}`, false);
      load();
    } catch (e) {
      if (!alive || (e && e.code === 'UNAUTHORIZED')) return;
      flash('บันทึกไม่สำเร็จ ' + errText(e), true);
    }
  }

  function card(f) {
    const isDraft = f.status === 'draft';
    const nextStatus = isDraft ? 'published' : 'draft';
    const nextV = Number(f.version) + 1;
    const confirmEl = h('span', { class: 'confirm-inline' });
    const toggleBtn = h('button', {
      type: 'button', class: 'btn',
      onclick: () => {
        clear(confirmEl);
        confirmEl.appendChild(h('span', null,
          `จะบันทึกเป็นเวอร์ชันใหม่ v${nextV} สถานะ ${nextStatus === 'published' ? 'ใช้งาน' : 'ร่าง'} ยืนยัน? `));
        confirmEl.appendChild(h('button', { type: 'button', class: 'btn btn-primary', onclick: () => { clear(confirmEl); changeStatus(f, nextStatus); } }, 'ใช่'));
        confirmEl.appendChild(h('button', { type: 'button', class: 'btn', onclick: () => clear(confirmEl) }, 'ไม่'));
      },
    }, isDraft ? 'เปิดให้ทุกคนใช้' : 'ซ่อนเป็นร่าง');
    return h('div', { class: 'card' },
      h('h2', { class: 'card-title' }, f.name || f.format_id),
      h('div', { class: 'card-meta' },
        h('span', { class: 'mono' }, f.format_id),
        h('span', { class: 'num' }, 'v' + f.version),
        h('span', { class: 'pill' }, isDraft ? 'ร่าง' : 'ใช้งาน')),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn', href: '#/admin/formats/edit/' + encodeURIComponent(f.format_id) }, 'แก้สเปก'),
        toggleBtn),
      confirmEl);
  }

  function show(formats) {
    clear(listEl);
    if (!formats.length) { listEl.appendChild(h('p', { class: 'empty' }, 'ยังไม่มีรูปแบบโพสต์')); return; }
    for (const f of formats) listEl.appendChild(card(f));
  }

  async function load() {
    clear(listEl);
    listEl.appendChild(h('p', { class: 'muted' }, 'กำลังโหลด...'));
    try {
      const data = await api('formats.list');
      if (!alive) return;
      const formats = Array.isArray(data) ? data : [];
      show(formats);
    } catch (e) {
      if (!alive || (e && e.code === 'UNAUTHORIZED')) return;
      clear(listEl);
      listEl.appendChild(h('div', { class: 'empty' },
        h('p', null, 'โหลดไม่สำเร็จ'),
        h('button', { type: 'button', class: 'btn', onclick: load }, 'ลองใหม่')));
    }
  }

  el.appendChild(h('section', { class: 'screen' },
    h('h1', null, 'รูปแบบโพสต์'),
    h('div', { class: 'btn-row' }, h('a', { class: 'btn btn-primary', href: '#/admin/formats/new' }, 'ถอดรูปแบบใหม่')),
    flashEl,
    listEl,
    h('p', null, h('a', { class: 'link-btn', href: '#/' }, 'กลับคลังโพสต์'))));
  window.addEventListener('hashchange', function stop() {
    alive = false;
    window.removeEventListener('hashchange', stop);
  });
  load();
}
