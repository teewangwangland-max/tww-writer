import { h, clear } from '../dom.js';
import { api } from '../api.js';
import * as store from '../store.js';

export function renderPickFormat(el) {
  let alive = true;
  const listEl = h('div', { class: 'list', 'aria-live': 'polite' });

  function show(formats) {
    clear(listEl);
    if (!formats.length) { listEl.appendChild(h('p', { class: 'empty' }, 'ยังไม่มีรูปแบบโพสต์ที่เปิดใช้')); return; }
    for (const f of formats) {
      listEl.appendChild(h('a', { class: 'card', href: '#/new/' + encodeURIComponent(f.format_id) },
        h('h2', { class: 'card-title' }, f.name || f.format_id),
        h('div', { class: 'card-meta' }, h('span', { class: 'num' }, 'v' + f.version))));
    }
  }

  async function load() {
    const cached = store.cacheGet('formats.list');
    if (Array.isArray(cached)) show(cached);
    else { clear(listEl); listEl.appendChild(h('p', { class: 'muted' }, 'กำลังโหลด...')); }
    try {
      const data = await api('formats.list');
      if (!alive) return;
      const formats = Array.isArray(data) ? data : [];
      store.cacheSet('formats.list', formats);
      show(formats);
    } catch (e) {
      if (!alive || (e && e.code === 'UNAUTHORIZED')) return;
      if (!Array.isArray(cached)) {
        clear(listEl);
        listEl.appendChild(h('div', { class: 'empty' },
          h('p', null, 'โหลดไม่สำเร็จ'),
          h('button', { type: 'button', class: 'btn', onclick: load }, 'ลองใหม่')));
      }
    }
  }

  el.appendChild(h('section', { class: 'screen' },
    h('h1', null, 'เลือกรูปแบบโพสต์'),
    listEl,
    h('p', null, h('a', { class: 'link-btn', href: '#/' }, 'กลับคลังโพสต์'))));
  window.addEventListener('hashchange', function stop() {
    alive = false;
    window.removeEventListener('hashchange', stop);
  });
  load();
}
