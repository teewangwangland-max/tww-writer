import { API_URL } from './config.js';
import * as store from './store.js';

export async function api(action, payload = {}) {
  let json;
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, token: store.getToken(), ...payload }),
      redirect: 'follow',
    });
    json = await res.json();
  } catch (e) {
    throw { code: 'NETWORK' };
  }
  if (!json || json.ok !== true) {
    const code = (json && json.error) || 'SERVER_ERROR';
    if (code === 'UNAUTHORIZED') {
      store.clearAuth();
      location.hash = '#/login';
    }
    throw { code, message: json && json.message };
  }
  return json.data;
}
