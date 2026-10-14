// calc.js - compute(spec, inputs) -> result

import { parse, evaluate, ExprError } from './expr.js';
import { formatValue } from './format.js';
import { getModule } from './modules.js';

function parseNumberLike(raw) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/,/g, '').trim();
    if (cleaned === '') return undefined;
    const n = Number(cleaned);
    return Number.isNaN(n) ? undefined : n;
  }
  return undefined;
}

function isMissing(raw) {
  return raw === undefined || raw === null || raw === '';
}

function processFields(spec, inputs, globalVars, values, errors, caseColumns, caseIds) {
  for (const field of spec.fields || []) {
    const key = field.key;
    const raw = inputs ? inputs[key] : undefined;

    switch (field.type) {
      case 'number': {
        if (isMissing(raw)) {
          if (field.required) {
            errors.push({ key, code: 'MISSING_INPUT', message: `Missing required field "${key}"` });
          } else if (field.default !== undefined) {
            globalVars[key] = field.default;
            values[key] = field.default;
          }
        } else {
          const n = parseNumberLike(raw);
          if (n === undefined) {
            errors.push({ key, code: 'MISSING_INPUT', message: `Invalid number for field "${key}"` });
          } else {
            globalVars[key] = n;
            values[key] = n;
          }
        }
        break;
      }
      case 'text': {
        if (isMissing(raw) && field.required) {
          errors.push({ key, code: 'MISSING_INPUT', message: `Missing required field "${key}"` });
        }
        break;
      }
      case 'rai_ngan_wa': {
        if (isMissing(raw)) {
          if (field.required) {
            errors.push({ key, code: 'MISSING_INPUT', message: `Missing required field "${key}"` });
          }
          break;
        }
        let rai, ngan, wa;
        if (typeof raw === 'string') {
          const parts = raw.split('-');
          rai = parseNumberLike(parts[0]) || 0;
          ngan = parseNumberLike(parts[1]) || 0;
          wa = parseNumberLike(parts[2]) || 0;
        } else {
          rai = parseNumberLike(raw.rai) || 0;
          ngan = parseNumberLike(raw.ngan) || 0;
          wa = parseNumberLike(raw.wa) || 0;
        }
        globalVars[`${key}_rai`] = rai;
        globalVars[`${key}_ngan`] = ngan;
        globalVars[`${key}_wa`] = wa;
        values[`${key}_rai`] = rai;
        values[`${key}_ngan`] = ngan;
        values[`${key}_wa`] = wa;
        break;
      }
      case 'comps_table': {
        if (isMissing(raw) && field.required) {
          errors.push({ key, code: 'MISSING_INPUT', message: `Missing required field "${key}"` });
        }
        const rows = Array.isArray(raw) ? raw : [];
        const prices = rows.map((r) => parseNumberLike(r.price_per_sqm)).filter((n) => n !== undefined);
        const count = prices.length;
        const avg = count ? prices.reduce((a, b) => a + b, 0) / count : 0;
        const min = count ? Math.min(...prices) : 0;
        const max = count ? Math.max(...prices) : 0;
        globalVars[`${key}_count`] = count;
        globalVars[`${key}_avg`] = avg;
        globalVars[`${key}_min`] = min;
        globalVars[`${key}_max`] = max;
        values[`${key}_count`] = count;
        values[`${key}_avg`] = avg;
        values[`${key}_min`] = min;
        values[`${key}_max`] = max;
        break;
      }
      case 'case_table': {
        const rawTable = raw || {};
        for (const caseId of caseIds) {
          const caseDef = (spec.cases || []).find((c) => c.id === caseId);
          for (const col of field.columns || []) {
            let v = rawTable[caseId] ? rawTable[caseId][col.key] : undefined;
            if (isMissing(v) && caseDef && caseDef.inputs && caseDef.inputs[col.key] !== undefined) {
              v = caseDef.inputs[col.key];
            }
            const n = parseNumberLike(v);
            if (n !== undefined) {
              caseColumns[caseId][col.key] = n;
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }
}

function errorCodeFor(e) {
  if (e instanceof ExprError) {
    if (e.code === 'UNKNOWN_IDENT') return 'DEPENDENCY';
    return e.code;
  }
  return 'ERROR';
}

export function compute(spec, inputs) {
  const errors = [];
  const values = {};
  const display = {};
  const globalVars = {};
  const caseIds = (spec.cases || []).map((c) => c.id);
  const caseColumns = {};
  const caseVars = {};
  for (const id of caseIds) {
    caseColumns[id] = {};
    caseVars[id] = {};
  }

  processFields(spec, inputs, globalVars, values, errors, caseColumns, caseIds);

  const globalList = [];
  const caseRows = {};
  for (const id of caseIds) caseRows[id] = [];

  for (const formula of spec.formulas || []) {
    if (formula.module) {
      const fn = getModule(formula.module);
      if (!fn) {
        errors.push({ key: formula.into, code: 'UNKNOWN_MODULE', message: `Unknown module "${formula.module}"` });
        continue;
      }
      let out;
      try {
        out = fn(formula.args || {}, globalVars) || {};
      } catch (e) {
        errors.push({ key: formula.into, code: 'MODULE_ERROR', message: String((e && e.message) || e) });
        continue;
      }
      for (const [k, v] of Object.entries(out)) {
        const varName = `${formula.into}_${k}`;
        globalVars[varName] = v;
        values[varName] = v;
      }
      continue;
    }

    if (formula.per_case) {
      for (const caseId of caseIds) {
        const scope = { ...globalVars, ...caseColumns[caseId], ...caseVars[caseId] };
        let val, err = null;
        try {
          const ast = parse(formula.expr);
          val = evaluate(ast, scope);
        } catch (e) {
          err = e;
        }
        if (err) {
          errors.push({ key: formula.key, caseId, code: errorCodeFor(err), message: err.message });
          continue;
        }
        caseVars[caseId][formula.key] = val;
        values[`${caseId}.${formula.key}`] = val;
        const text = formatValue(val, formula.format);
        display[`${caseId}.${formula.key}`] = text;
        if (formula.show !== false) {
          caseRows[caseId].push({ key: formula.key, label: formula.label, value: val, text });
        }
      }
    } else {
      const scope = { ...globalVars };
      for (const caseId of caseIds) {
        for (const [k, v] of Object.entries(caseVars[caseId])) {
          scope[`${caseId}.${k}`] = v;
        }
      }
      let val, err = null;
      try {
        const ast = parse(formula.expr);
        val = evaluate(ast, scope);
      } catch (e) {
        err = e;
      }
      if (err) {
        errors.push({ key: formula.key, code: errorCodeFor(err), message: err.message });
      } else {
        globalVars[formula.key] = val;
        values[formula.key] = val;
        const text = formatValue(val, formula.format);
        display[formula.key] = text;
        if (formula.show !== false) {
          globalList.push({ key: formula.key, label: formula.label, value: val, text });
        }
      }
    }
  }

  const cases = caseIds.map((id) => {
    const caseDef = (spec.cases || []).find((c) => c.id === id);
    return { id, label: caseDef ? caseDef.label : id, rows: caseRows[id] };
  });

  let summary = '';
  if (spec.summary && spec.summary.key && !spec.summary.per_case_key) {
    summary = display[spec.summary.key] !== undefined ? display[spec.summary.key] : '';
  } else if (spec.summary && spec.summary.per_case_key) {
    const key = spec.summary.per_case_key;
    summary = caseIds
      .map((id) => {
        const caseDef = (spec.cases || []).find((c) => c.id === id);
        const label = caseDef ? caseDef.label : id;
        const v = caseVars[id][key];
        return `${label} ${v}`;
      })
      .join(' · ');
  }

  return {
    ok: errors.length === 0,
    errors,
    values,
    display,
    global: globalList,
    cases,
    summary
  };
}
