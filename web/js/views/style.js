// #/style: personal style profile, my Style DNA (versions), my example library.
import { h } from '../dom.js';
import { api } from '../api.js';
import * as store from '../store.js';
import { PLAYFULNESS } from '../prompt/build-write.js';
import { renderDnaEditor, errMsg } from '../style/dna-editor.js';
import { renderDnaUpdate } from '../style/dna-update.js';
import { renderExamplesPanel } from '../style/examples-panel.js';

function profileSection(user) {
  let level = Number(user.playfulness_default) >= 1 ? Number(user.playfulness_default) : 3;
  const caption = h('p', { class: 'muted' }, PLAYFULNESS[level] || '');
  const segs = [1, 2, 3, 4, 5].map((n) => h('button', {
    type: 'button', class: 'seg-btn', 'aria-pressed': String(level === n),
    onclick: () => {
      level = n;
      segs.forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === n)));
      caption.textContent = PLAYFULNESS[n] || '';
    },
  }, String(n)));
  const catchIn = h('textarea', { class: 'input', id: 'sty-catch', rows: '4' });
  catchIn.value = user.catchphrases || '';
  const avoidIn = h('textarea', { class: 'input', id: 'sty-avoid', rows: '4' });
  avoidIn.value = user.avoid_list || '';
  const msg = h('p', { class: 'muted', role: 'status', 'aria-live': 'polite' });
  const btn = h('button', { type: 'button', class: 'btn btn-primary' }, 'บันทึก');
  btn.addEventListener('click', async () => {
    msg.className = 'muted';
    msg.textContent = '';
    btn.disabled = true;
    try {
      const catchphrases = catchIn.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join('\n');
      const avoid = avoidIn.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join('\n');
      const updated = await api('users.updateProfile', {
        playfulness_default: level, catchphrases, avoid_list: avoid,
      });
      if (updated) store.setAuth(store.getToken(), updated);
      msg.textContent = 'บันทึกแล้ว';
    } catch (e) {
      if (e && e.code === 'UNAUTHORIZED') return;
      msg.className = 'form-error';
      msg.textContent = errMsg(e);
    }
    btn.disabled = false;
  });
  return h('section', { class: 'style-section' },
    h('h2', null, 'ตั้งค่าสไตล์ส่วนตัว'),
    h('div', { class: 'field' },
      h('span', { class: 'field-label', id: 'sty-pf-label' }, 'ระดับความขี้เล่นเริ่มต้น'),
      h('div', { class: 'seg', role: 'group', 'aria-labelledby': 'sty-pf-label' }, segs), caption),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sty-catch' }, 'คำติดปาก (หนึ่งรายการต่อบรรทัด)'), catchIn),
    h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'sty-avoid' }, 'สิ่งที่ไม่ใช้ (หนึ่งรายการต่อบรรทัด)'), avoidIn),
    h('div', { class: 'btn-row' }, btn), msg);
}

export function renderStyle(el) {
  const user = store.getUser() || {};
  const uid = user.user_id;
  const editor = renderDnaEditor({ scope: uid, isHouse: false, canEdit: true, userName: (id) => (id === uid ? (user.display_name || 'ฉัน') : id) });
  el.appendChild(h('section', { class: 'screen' },
    h('h1', null, 'สไตล์ของฉัน'),
    profileSection(user),
    h('section', { class: 'style-section' },
      h('h2', null, 'Style DNA ของฉัน'),
      editor.el,
      renderDnaUpdate({ scope: uid, ownerForExamples: uid, isHouse: false, displayName: user.display_name, editor })),
    h('section', { class: 'style-section' },
      h('h2', null, 'คลังตัวอย่างของฉัน'),
      renderExamplesPanel({ owner: uid, canManage: true, isAdmin: user.role === 'admin' }))
  ));
}
