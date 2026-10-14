import { h, clear } from './dom.js';
import * as store from './store.js';
import { api } from './api.js';
import { startRouter } from './router.js';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

const root = document.getElementById('app');
const headerEl = h('header', { class: 'app-header' });
const mainEl = h('main', { class: 'app-main' });
root.appendChild(headerEl);
root.appendChild(mainEl);

async function logout() {
  try { await api('auth.logout'); } catch (e) { /* ignore */ }
  store.clearAuth();
  location.hash = '#/login';
}

function renderHeader(route) {
  clear(headerEl);
  const isLogin = !route || route.public;
  headerEl.hidden = isLogin;
  if (isLogin) return;
  const user = store.getUser();
  const links = [h('a', { class: 'link-btn', href: '#/style' }, 'สไตล์ของฉัน')];
  if (user && user.role === 'admin') {
    links.push(h('a', { class: 'link-btn', href: '#/style/house' }, 'House Style'));
    links.push(h('a', { class: 'link-btn', href: '#/admin/formats' }, 'ถอดรูปแบบ'));
  }
  headerEl.appendChild(h('div', { class: 'header-inner' },
    h('a', { class: 'brand', href: '#/' }, 'ที่ว่างว่าง'),
    h('div', { class: 'header-user' },
      h('span', { class: 'user-name' }, (user && user.display_name) || ''),
      h('button', { type: 'button', class: 'link-btn', onclick: logout }, 'ออกจากระบบ')
    ),
    h('nav', { class: 'header-nav' }, links)
  ));
}

startRouter(mainEl, (path, route) => renderHeader(route));
