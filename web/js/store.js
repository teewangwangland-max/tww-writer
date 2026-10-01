const K_TOKEN = 'tww.token';
const K_USER = 'tww.user';
const K_CACHE = 'tww.cache.';

function read(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function write(key, val) {
  try { localStorage.setItem(key, val); } catch (e) { /* ignore */ }
}
function remove(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

export function getToken() { return read(K_TOKEN) || null; }

export function getUser() {
  const raw = read(K_USER);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export function setAuth(token, user) {
  write(K_TOKEN, token);
  write(K_USER, JSON.stringify(user || null));
}

export function clearAuth() {
  remove(K_TOKEN);
  remove(K_USER);
}

export function cacheGet(key) {
  const raw = read(K_CACHE + key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

export function cacheSet(key, val) {
  try { write(K_CACHE + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
}

// Plain preference values (e.g. last library scope), not JSON.
export function prefGet(key) { return read('tww.pref.' + key); }
export function prefSet(key, val) { write('tww.pref.' + key, String(val)); }
