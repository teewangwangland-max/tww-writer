import { h, clear } from '../dom.js';
import { api } from '../api.js';
import * as store from '../store.js';
import { thaiShortDate, postStatusLabel, verdictColor, parseSummary } from '../format-th.js';

const SCOPES = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'mine', label: 'ของฉัน' },
  { id: 'friends', label: 'เพื่อน' },
];

function summaryNode(text) {
  const wrap = h('p', { class: 'card-summary' });
  for (const seg of parseSummary(text)) {
    if (seg.verdict) {
      const span = h('span', { class: 'verdict' }, seg.text);
      span.style.color = verdictColor(seg.verdict);
      wrap.appendChild(span);
    } else {
      // numbers get mono font
      for (const part of seg.text.split(/(\d[\d,.]*)/)) {
        if (part === '') continue;
        wrap.appendChild(/^\d/.test(part) ? h('span', { class: 'num' }, part) : document.createTextNode(part));
      }
    }
  }
  return wrap;
}

function card(post) {
  const meta = [];
  const push = (node) => {
    if (meta.length) meta.push(h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'));
    meta.push(node);
  };
  if (post.author_name) push(h('span', null, post.author_name));
  if (post.format_name) push(h('span', null, post.format_name));
  push(h('span', { class: 'pill' }, postStatusLabel(post.post_status)));
  const d = thaiShortDate(post.updated_at);
  if (d) push(h('span', { class: 'num' }, d));

  return h('a', { class: 'card', href: '#/post/' + encodeURIComponent(post.post_id) },
    h('h2', { class: 'card-title' }, post.project_name || ''),
    post.location ? h('p', { class: 'card-location' }, post.location) : null,
    h('div', { class: 'card-meta' }, meta),
    post.case_summary ? summaryNode(post.case_summary) : null
  );
}

function skeleton() {
  return h('div', { class: 'card skeleton', 'aria-hidden': 'true' },
    h('div', { class: 'sk-line sk-title' }),
    h('div', { class: 'sk-line' }),
    h('div', { class: 'sk-line sk-short' })
  );
}

export function renderLibrary(el) {
  let scope = store.prefGet('scope');
  if (!SCOPES.some((s) => s.id === scope)) scope = 'all';
  let q = '';
  let timer = null;
  let seq = 0;
  let alive = true;

  const listEl = h('div', { class: 'list', 'aria-live': 'polite' });
  const segButtons = SCOPES.map((s) => h('button', {
    type: 'button', class: 'seg-btn', 'aria-pressed': String(s.id === scope),
    onclick: () => {
      scope = s.id;
      store.prefSet('scope', scope);
      segButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(SCOPES[i].id === scope)));
      load();
    },
  }, s.label));

  const search = h('input', {
    type: 'search', class: 'input', placeholder: 'ค้นชื่อโครงการหรือทำเล',
    autocomplete: 'off', 'aria-label': 'ค้นชื่อโครงการหรือทำเล',
    oninput: () => {
      clearTimeout(timer);
      timer = setTimeout(() => { q = search.value.trim(); load(); }, 300);
    },
  });

  function showList(posts) {
    clear(listEl);
    if (!posts.length) {
      listEl.appendChild(h('p', { class: 'empty' }, 'ยังไม่มีโพสต์ในมุมนี้'));
      return;
    }
    for (const p of posts) listEl.appendChild(card(p));
  }

  function showError() {
    clear(listEl);
    listEl.appendChild(h('div', { class: 'empty' },
      h('p', null, 'โหลดไม่สำเร็จ'),
      h('button', { type: 'button', class: 'btn', onclick: () => load() }, 'ลองใหม่')
    ));
  }

  async function load() {
    const mine = ++seq;
    const cacheKey = 'posts.' + scope;
    const useCache = q === '';
    const cached = useCache ? store.cacheGet(cacheKey) : null;
    if (Array.isArray(cached)) showList(cached);
    else { clear(listEl); for (let i = 0; i < 3; i++) listEl.appendChild(skeleton()); }
    try {
      const payload = { scope };
      if (q) payload.q = q;
      const data = await api('posts.list', payload);
      if (!alive || mine !== seq) return;
      const posts = Array.isArray(data) ? data : [];
      if (useCache) store.cacheSet(cacheKey, posts);
      showList(posts);
    } catch (e) {
      if (!alive || mine !== seq) return;
      if (e && e.code === 'UNAUTHORIZED') return;
      if (!Array.isArray(cached)) showError();
    }
  }

  el.appendChild(h('section', { class: 'screen library' },
    h('h1', null, 'คลังโพสต์'),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'กรองโพสต์' }, segButtons),
    search,
    listEl
  ));
  el.appendChild(h('div', { class: 'bottom-bar' },
    h('a', { class: 'btn btn-primary btn-block', href: '#/new' }, 'เขียนโพสต์ใหม่')
  ));

  window.addEventListener('hashchange', function stop() {
    alive = false;
    clearTimeout(timer);
    window.removeEventListener('hashchange', stop);
  });
  load();
}
