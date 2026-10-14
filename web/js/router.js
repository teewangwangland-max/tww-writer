import * as store from './store.js';
import { clear } from './dom.js';
import { renderLogin } from './views/login.js';
import { renderLibrary } from './views/library.js';
import { renderPlaceholder } from './views/placeholder.js';
import { renderAdminFormats } from './views/admin-formats.js';
import { renderFormatExtract } from './views/format-extract.js';
import { renderPickFormat } from './views/pick-format.js';
import { renderWizard } from './views/wizard.js';
import { renderPostView } from './views/post-view.js';

const ROUTES = [
  { pattern: /^\/login$/, view: (el) => renderLogin(el), public: true },
  { pattern: /^\/$/, view: (el) => renderLibrary(el) },
  { pattern: /^\/new$/, view: (el) => renderPickFormat(el) },
  { pattern: /^\/new\/([^/]+)$/, view: (el, p) => renderWizard(el, p, 'new'), params: ['formatId'] },
  { pattern: /^\/edit\/([^/]+)$/, view: (el, p) => renderWizard(el, p, 'edit'), params: ['postId'] },
  { pattern: /^\/post\/([^/]+)$/, view: (el, p) => renderPostView(el, p), params: ['id'] },
  { pattern: /^\/admin\/formats$/, view: (el) => renderAdminFormats(el), admin: true },
  { pattern: /^\/admin\/formats\/new$/, view: (el) => renderFormatExtract(el, {}), admin: true },
  { pattern: /^\/admin\/formats\/edit\/([^/]+)$/, view: (el, p) => renderFormatExtract(el, p), params: ['formatId'], admin: true },
  { pattern: /^\/style$/, view: (el) => renderPlaceholder(el, 'สไตล์ของฉัน', 'Style DNA (กำลังสร้าง)') },
];

export function currentPath() {
  const h = location.hash || '';
  const p = h.startsWith('#') ? h.slice(1) : h;
  return p === '' ? '/' : p.split('?')[0];
}

function redirect(path) {
  const target = '#' + path;
  if (location.hash !== target) location.hash = target;
}

// Decide what to do for a path. Returns { redirect } or { route, params }.
export function resolve(path, token, user) {
  if (path === '/login') {
    return token ? { redirect: '/' } : { route: ROUTES[0], params: {} };
  }
  if (!token) return { redirect: '/login' };
  for (const route of ROUTES) {
    const m = route.pattern.exec(path);
    if (!m) continue;
    if (route.admin && !(user && user.role === 'admin')) return { redirect: '/' };
    const params = {};
    (route.params || []).forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]); });
    return { route, params };
  }
  return { redirect: '/' };
}

export function startRouter(mainEl, onRender) {
  function run() {
    const path = currentPath();
    const r = resolve(path, store.getToken(), store.getUser());
    if (r.redirect) { redirect(r.redirect); return; }
    clear(mainEl);
    if (onRender) onRender(path, r.route);
    r.route.view(mainEl, r.params);
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', run);
  run();
}
