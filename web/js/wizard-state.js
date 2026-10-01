// Pure wizard state helpers (no DOM). Storage helpers guard against missing localStorage.

export const STEP_LABELS = ['กรอก', 'ผลคำนวณ', 'เตรียม prompt', 'วางโพสต์', 'บันทึก'];

function clampLevel(n) {
  const x = Math.round(Number(n));
  if (!Number.isFinite(x)) return 3;
  return Math.min(5, Math.max(1, x));
}

export function emptyInputs(spec) {
  const inputs = {};
  for (const f of spec.fields || []) {
    switch (f.type) {
      case 'number':
        inputs[f.key] = f.default !== undefined ? f.default : '';
        break;
      case 'text':
        inputs[f.key] = f.default !== undefined ? String(f.default) : '';
        break;
      case 'rai_ngan_wa':
        inputs[f.key] = { rai: '', ngan: '', wa: '' };
        break;
      case 'comps_table':
        inputs[f.key] = [];
        break;
      case 'case_table': {
        const table = {};
        for (const c of spec.cases || []) {
          table[c.id] = {};
          for (const col of f.columns || []) {
            const d = c.inputs && c.inputs[col.key] !== undefined ? c.inputs[col.key] : '';
            table[c.id][col.key] = d;
          }
        }
        inputs[f.key] = table;
        break;
      }
      default:
        break;
    }
  }
  return inputs;
}

export function emptyState(spec, user, formatVersion) {
  return {
    v: 1,
    postId: null,
    formatId: spec.id,
    formatVersion: formatVersion === undefined ? (spec.version === undefined ? null : spec.version) : formatVersion,
    step: 1,
    inputs: emptyInputs(spec),
    narrative: {},
    tone: {
      playfulness: clampLevel(user && user.playfulness_default ? user.playfulness_default : 3),
      options: []
    },
    body: '',
    saveAsExample: false,
    updatedAt: null
  };
}

export function serialize(state) {
  return JSON.stringify(state);
}

export function deserialize(text) {
  if (typeof text !== 'string' || text === '') return null;
  let obj;
  try { obj = JSON.parse(text); } catch (e) { return null; }
  if (!obj || typeof obj !== 'object' || obj.v !== 1) return null;
  if (!obj.inputs || typeof obj.inputs !== 'object') return null;
  if (!obj.tone || typeof obj.tone !== 'object') obj.tone = { playfulness: 3, options: [] };
  if (!Array.isArray(obj.tone.options)) obj.tone.options = [];
  if (!obj.narrative || typeof obj.narrative !== 'object') obj.narrative = {};
  if (typeof obj.body !== 'string') obj.body = '';
  const step = Number(obj.step);
  obj.step = step >= 1 && step <= 5 ? Math.floor(step) : 1;
  return obj;
}

export function draftKey(state) {
  return state.postId ? 'tww.draft.post.' + state.postId : 'tww.draft.' + state.formatId;
}

export function loadDraft(key) {
  try { return deserialize(localStorage.getItem(key)); } catch (e) { return null; }
}

export function saveDraft(state) {
  try {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(draftKey(state), serialize(state));
  } catch (e) { /* ignore */ }
}

export function removeDraft(key) {
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

function blank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

// Inputs as the engine should see them: blank rai/ngan/wa and empty comps are treated as missing.
export function normalizeInputs(spec, inputs) {
  const out = { ...(inputs || {}) };
  for (const f of spec.fields || []) {
    const raw = out[f.key];
    if (f.type === 'rai_ngan_wa') {
      if (raw && typeof raw === 'object' && blank(raw.rai) && blank(raw.ngan) && blank(raw.wa)) delete out[f.key];
    } else if (f.type === 'comps_table') {
      const rows = (Array.isArray(raw) ? raw : []).filter((r) => r && !blank(r.price_per_sqm));
      if (rows.length) out[f.key] = rows;
      else delete out[f.key];
    }
  }
  return out;
}

// Merge a stored inputs object over fresh defaults so new spec fields still have values.
export function mergeInputs(spec, stored) {
  const base = emptyInputs(spec);
  const src = stored && typeof stored === 'object' ? stored : {};
  for (const k of Object.keys(base)) {
    if (src[k] !== undefined && src[k] !== null) {
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && typeof src[k] === 'object') {
        base[k] = { ...base[k], ...src[k] };
      } else {
        base[k] = src[k];
      }
    }
  }
  return base;
}

export function projectNameOf(spec, inputs) {
  const texts = (spec.fields || []).filter((f) => f.type === 'text');
  const named = texts.find((f) => f.key === 'project_name') || texts[0];
  return named ? String(inputs[named.key] || '').trim() : '';
}

export function locationOf(spec, inputs) {
  const has = (spec.fields || []).some((f) => f.key === 'location' && f.type === 'text');
  return has ? String(inputs.location || '').trim() : '';
}
