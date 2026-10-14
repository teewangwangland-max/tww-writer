// Pure helpers for the format extractor: tolerant JSON extraction + id suggestion.

function tryParse(text) {
  try { return { ok: true, value: JSON.parse(text) }; } catch (e) { return { ok: false, error: e.message }; }
}

function parseLoose(text) {
  let r = tryParse(text);
  if (r.ok) return r;
  const swapped = text.replace(/[“”]/g, '"');
  if (swapped !== text) {
    const r2 = tryParse(swapped);
    if (r2.ok) return r2;
  }
  return r;
}

export function extractJson(text) {
  let src = typeof text === 'string' ? text : '';
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  if (src.trim() === '') return { ok: false, error: 'ยังไม่มีข้อความ' };
  let body = null;
  const fence = /```(?:json)?[ \t]*\r?\n?([\s\S]*?)```/i.exec(src);
  if (fence) body = fence[1];
  if (body === null || body.trim() === '') {
    const a = src.indexOf('{');
    const b = src.lastIndexOf('}');
    body = a >= 0 && b > a ? src.slice(a, b + 1) : src;
  }
  const r = parseLoose(body.trim());
  if (!r.ok) {
    // fenced block may not hold the object; fall back to first { .. last } of the whole text
    const a = src.indexOf('{');
    const b = src.lastIndexOf('}');
    if (fence && a >= 0 && b > a) {
      const r2 = parseLoose(src.slice(a, b + 1));
      if (r2.ok && r2.value && typeof r2.value === 'object' && !Array.isArray(r2.value)) return r2;
    }
    return { ok: false, error: r.error };
  }
  if (!r.value || typeof r.value !== 'object' || Array.isArray(r.value)) {
    return { ok: false, error: 'ต้องเป็น JSON object' };
  }
  return r;
}

export function suggestFormatId(date, rand) {
  const d = new Date(date.getTime() + 7 * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  let r = typeof rand === 'string' ? rand : Math.floor((typeof rand === 'number' ? rand : Math.random()) * 36 ** 4).toString(36);
  r = r.toLowerCase().replace(/[^a-z0-9]/g, '').padStart(4, '0').slice(0, 4);
  return `fmt-${ymd}-${r}`;
}

// ---- sample_inputs <-> form inputs (pure) ----

function numOrKeep(v) {
  if (typeof v === 'number') return v;
  const s = String(v === undefined || v === null ? '' : v).replace(/,/g, '').trim();
  if (s === '') return '';
  const n = Number(s);
  return Number.isNaN(n) ? s : n;
}

// Form inputs (strings, {rai,ngan,wa}) -> compact sample_inputs shape stored in the spec.
export function inputsToSample(spec, inputs) {
  const out = {};
  const src = inputs || {};
  for (const f of spec.fields || []) {
    const v = src[f.key];
    if (v === undefined || v === null) continue;
    if (f.type === 'number') {
      const n = numOrKeep(v);
      if (n !== '') out[f.key] = n;
    } else if (f.type === 'text') {
      if (String(v) !== '') out[f.key] = String(v);
    } else if (f.type === 'rai_ngan_wa') {
      if (typeof v === 'string') { if (v.trim() !== '') out[f.key] = v.trim(); continue; }
      const parts = [v.rai, v.ngan, v.wa].map((p) => (p === undefined || p === null || String(p).trim() === '' ? '' : String(p).trim()));
      if (parts.some((p) => p !== '')) out[f.key] = parts.map((p) => (p === '' ? '0' : p)).join('-');
    } else if (f.type === 'comps_table') {
      const rows = (Array.isArray(v) ? v : []).filter((r) => r && String(r.price_per_sqm === undefined ? '' : r.price_per_sqm).trim() !== '');
      if (rows.length) out[f.key] = rows.map((r) => ({ name: String(r.name || ''), price_per_sqm: numOrKeep(r.price_per_sqm) }));
    } else if (f.type === 'case_table') {
      const table = {};
      for (const [caseId, cols] of Object.entries(v || {})) {
        const row = {};
        for (const [ck, cv] of Object.entries(cols || {})) {
          const n = numOrKeep(cv);
          if (n !== '') row[ck] = n;
        }
        table[caseId] = row;
      }
      out[f.key] = table;
    }
  }
  return out;
}

// sample_inputs -> form inputs over the spec's empty defaults (rai strings become {rai,ngan,wa}).
export function sampleToInputs(spec, sample, emptyInputs) {
  const base = emptyInputs(spec);
  const src = sample && typeof sample === 'object' ? sample : {};
  for (const f of spec.fields || []) {
    const v = src[f.key];
    if (v === undefined || v === null) continue;
    if (f.type === 'number') base[f.key] = typeof v === 'number' ? v : String(v);
    else if (f.type === 'text') base[f.key] = String(v);
    else if (f.type === 'rai_ngan_wa') {
      if (typeof v === 'string') {
        const p = v.split('-');
        base[f.key] = { rai: p[0] || '', ngan: p[1] || '', wa: p[2] || '' };
      } else if (typeof v === 'object') {
        base[f.key] = { rai: v.rai === undefined ? '' : v.rai, ngan: v.ngan === undefined ? '' : v.ngan, wa: v.wa === undefined ? '' : v.wa };
      }
    } else if (f.type === 'comps_table') {
      if (Array.isArray(v)) base[f.key] = v.map((r) => ({ name: String((r && r.name) || ''), price_per_sqm: r && r.price_per_sqm !== undefined ? r.price_per_sqm : '' }));
    } else if (f.type === 'case_table') {
      if (typeof v === 'object') {
        for (const [caseId, cols] of Object.entries(v)) {
          if (!base[f.key][caseId]) base[f.key][caseId] = {};
          Object.assign(base[f.key][caseId], cols);
        }
      }
    }
  }
  return base;
}
