import { h, clear } from '../dom.js';
import { api } from '../api.js';
import * as store from '../store.js';
import { compute } from '../engine/index.js';
import { getSpec } from '../formats.js';
import { thaiShortDate, postStatusLabel } from '../format-th.js';
import { renderResults, renderStoredResults } from '../results-view.js';
import { normalizeInputs } from '../wizard-state.js';
import { copyText } from '../clipboard.js';

function formatName(formatId, fallback) {
  if (fallback) return fallback;
  const list = store.cacheGet('formats.list');
  const f = Array.isArray(list) ? list.find((x) => x.format_id === formatId) : null;
  return f ? f.name : formatId;
}

export function renderPostView(el, params) {
  let alive = true;
  window.addEventListener('hashchange', function stop() {
    alive = false;
    window.removeEventListener('hashchange', stop);
  });
  const root = h('section', { class: 'screen post-view' }, h('p', { class: 'muted' }, 'กำลังโหลด...'));
  el.appendChild(root);

  async function load() {
    let post;
    try {
      post = await api('posts.get', { post_id: params.id });
    } catch (e) {
      if (!alive || (e && e.code === 'UNAUTHORIZED')) return;
      clear(root);
      root.appendChild(h('h1', null, 'โพสต์'));
      root.appendChild(h('p', { class: 'form-error' }, e && e.code === 'NOT_FOUND' ? 'ไม่พบโพสต์นี้' : 'โหลดไม่สำเร็จ'));
      root.appendChild(h('div', { class: 'btn-row' },
        e && e.code === 'NOT_FOUND' ? null : h('button', { type: 'button', class: 'btn', onclick: load }, 'ลองใหม่'),
        h('a', { class: 'btn', href: '#/' }, 'กลับคลังโพสต์')));
      return;
    }
    if (!alive) return;
    show(post);
  }

  function show(post) {
    const user = store.getUser() || {};
    const isOwner = post.user_id === user.user_id;
    const meta = [];
    const push = (n) => {
      if (meta.length) meta.push(h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'));
      meta.push(n);
    };
    if (post.author_name) push(h('span', null, post.author_name));
    const fnameEl = h('span', null, formatName(post.format_id));
    push(fnameEl);
    push(h('span', { class: 'pill' }, postStatusLabel(post.post_status)));
    const d = thaiShortDate(post.updated_at);
    if (d) push(h('span', { class: 'num' }, d));

    const resultsHost = h('div', null, post.results ? renderStoredResults(post.results) : null);
    const copyMsg = h('span', { class: 'muted', role: 'status', 'aria-live': 'polite' });
    const body = post.body || '';

    clear(root);
    root.appendChild(h('h1', null, post.project_name || ''));
    if (post.location) root.appendChild(h('p', { class: 'card-location' }, post.location));
    root.appendChild(h('div', { class: 'card-meta' }, meta));
    const actions = [];
    if (post.doc_url) actions.push(h('a', { class: 'btn', href: post.doc_url, target: '_blank', rel: 'noopener noreferrer' }, 'เปิด Google Doc'));
    if (isOwner) actions.push(h('a', { class: 'btn btn-primary', href: '#/edit/' + encodeURIComponent(post.post_id) }, 'แก้ไข'));
    if (actions.length) root.appendChild(h('div', { class: 'btn-row' }, actions));
    root.appendChild(h('h2', { class: 'sub-h' }, 'ผลคำนวณ'));
    root.appendChild(resultsHost);
    root.appendChild(h('h2', { class: 'sub-h' }, 'ข้อความโพสต์'));
    root.appendChild(body.trim()
      ? h('div', { class: 'post-body' }, body)
      : h('p', { class: 'muted' }, 'ยังไม่มีข้อความโพสต์'));
    if (body.trim()) {
      root.appendChild(h('div', { class: 'btn-row' },
        h('button', {
          type: 'button', class: 'btn',
          onclick: async () => { copyMsg.textContent = (await copyText(body)) ? 'คัดลอกแล้ว' : 'คัดลอกไม่สำเร็จ'; },
        }, 'คัดลอกข้อความ'),
        copyMsg));
    }
    root.appendChild(h('p', null, h('a', { class: 'link-btn', href: '#/' }, 'กลับคลังโพสต์')));

    // Upgrade: re-run the engine when the format version still matches the stored one.
    getSpec(post.format_id).then((info) => {
      if (!alive) return;
      if (info.name) fnameEl.textContent = info.name;
      const stored = post.results || {};
      if (post.inputs && String(info.version) === String(stored.format_version)) {
        const r = compute(info.spec, normalizeInputs(info.spec, post.inputs));
        if (r.ok) { clear(resultsHost); resultsHost.appendChild(renderResults(r, info.spec)); }
      }
    }).catch(() => {});
  }

  load();
}
