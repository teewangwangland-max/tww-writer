import { h } from '../dom.js';
import { api } from '../api.js';
import * as store from '../store.js';

export function loginErrorMessage(e) {
  const code = e && e.code;
  if (code === 'BAD_CREDENTIALS') return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  if (code === 'LOCKED') return 'ลองผิดหลายครั้ง กรุณารอ 15 นาที';
  if (code === 'NETWORK') return 'เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง';
  return `เกิดข้อผิดพลาด (${code || 'UNKNOWN'})`;
}

export function renderLogin(el) {
  const username = h('input', {
    id: 'username', name: 'username', type: 'text', class: 'input',
    autocomplete: 'username', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', required: true,
  });
  const password = h('input', {
    id: 'password', name: 'password', type: 'password', class: 'input',
    autocomplete: 'current-password', required: true,
  });
  const button = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'เข้าสู่ระบบ');
  const error = h('p', { class: 'form-error', role: 'alert' });

  const form = h('form', {
    class: 'login-form',
    onsubmit: async (ev) => {
      ev.preventDefault();
      error.textContent = '';
      button.disabled = true;
      button.textContent = 'กำลังเข้าสู่ระบบ…';
      try {
        const data = await api('auth.login', { username: username.value.trim(), password: password.value });
        store.setAuth(data.token, data.user);
        password.value = '';
        location.hash = '#/';
      } catch (e) {
        error.textContent = loginErrorMessage(e);
        button.disabled = false;
        button.textContent = 'เข้าสู่ระบบ';
      }
    },
  },
    h('label', { class: 'field', for: 'username' }, h('span', { class: 'field-label' }, 'ชื่อผู้ใช้'), username),
    h('label', { class: 'field', for: 'password' }, h('span', { class: 'field-label' }, 'รหัสผ่าน'), password),
    button,
    error
  );

  el.appendChild(h('section', { class: 'screen login' },
    h('p', { class: 'brand brand-large' }, 'ที่ว่างว่าง'),
    h('h1', null, 'เข้าสู่ระบบ'),
    form
  ));
}
