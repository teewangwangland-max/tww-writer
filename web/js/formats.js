import { api } from './api.js';
import * as store from './store.js';
import { validateSpec } from './engine/index.js';

// Returns { spec, version, name }. Network first; falls back to the cached copy when offline.
export async function getSpec(formatId) {
  const cacheKey = 'format.' + formatId;
  let data = null;
  try {
    data = await api('formats.get', { format_id: formatId });
    if (data && data.spec) {
      store.cacheSet(cacheKey, { version: data.version, name: data.name, spec: data.spec });
    }
  } catch (e) {
    if (!e || e.code !== 'NETWORK') throw e;
    const cached = store.cacheGet(cacheKey);
    if (!cached || !cached.spec) throw e;
    data = cached;
  }
  if (!data || !data.spec) throw { code: 'NOT_FOUND' };
  const v = validateSpec(data.spec);
  if (!v.ok) throw { code: 'INVALID_SPEC', errors: v.errors };
  const spec = data.spec;
  if (spec.version === undefined) spec.version = data.version;
  return { spec, version: data.version, name: data.name || spec.name };
}

export function specProblemMessage(err) {
  const errs = (err && err.errors) || [];
  return 'รูปแบบนี้มีปัญหา: ' + errs.slice(0, 3).join(' | ');
}
