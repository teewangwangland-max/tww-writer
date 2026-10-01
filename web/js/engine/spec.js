// spec.js - validateSpec(spec) -> { ok, errors, warnings }

import { parse, identifiersOf, ExprError } from './expr.js';
import { getModule } from './modules.js';

const KNOWN_FIELD_TYPES = new Set(['number', 'text', 'rai_ngan_wa', 'comps_table', 'case_table']);
const KNOWN_FORMAT_TYPES = new Set(['int', 'number', 'million', 'thousand', 'percent', 'text']);
const KEY_RE = /^[a-z][a-z0-9_]*$/;

function fieldExposedNames(field) {
  switch (field.type) {
    case 'number':
      return [field.key];
    case 'rai_ngan_wa':
      return [`${field.key}_rai`, `${field.key}_ngan`, `${field.key}_wa`];
    case 'comps_table':
      return [`${field.key}_count`, `${field.key}_avg`, `${field.key}_min`, `${field.key}_max`];
    default:
      return [];
  }
}

export function validateSpec(spec) {
  const errors = [];
  const warnings = [];

  if (!spec || typeof spec !== 'object') {
    return { ok: false, errors: ['Spec must be an object'], warnings };
  }

  const requiredTop = ['schema_version', 'id', 'name', 'fields', 'formulas', 'sections', 'checks'];
  for (const key of requiredTop) {
    if (spec[key] === undefined) {
      errors.push(`Missing top-level "${key}"`);
    }
  }

  const fields = Array.isArray(spec.fields) ? spec.fields : [];
  const formulas = Array.isArray(spec.formulas) ? spec.formulas : [];
  const cases = Array.isArray(spec.cases) ? spec.cases : [];
  const checks = Array.isArray(spec.checks) ? spec.checks : [];
  const sections = Array.isArray(spec.sections) ? spec.sections : [];

  if (Array.isArray(spec.sections) && spec.sections.length === 0) {
    warnings.push('sections is empty');
  }

  const seenKeys = new Set();
  const textFieldKeys = new Set();
  const globalUnqualified = new Set();
  const caseColumnNames = new Set();
  let caseTableCount = 0;
  const caseIds = cases.map((c) => c.id);

  for (const field of fields) {
    if (!field || typeof field !== 'object') continue;
    const key = field.key;
    if (key === undefined) {
      errors.push('Field missing "key"');
      continue;
    }
    if (!KEY_RE.test(key)) {
      errors.push(`Field key "${key}" does not match required pattern`);
    }
    if (seenKeys.has(key)) {
      errors.push(`Duplicate key "${key}" across fields/formulas`);
    } else {
      seenKeys.add(key);
    }
    if (!KNOWN_FIELD_TYPES.has(field.type)) {
      errors.push(`Unknown field type "${field.type}" for field "${key}"`);
      continue;
    }
    if (field.type === 'text') {
      textFieldKeys.add(key);
    } else if (field.type === 'case_table') {
      caseTableCount++;
      if (caseIds.length === 0) {
        errors.push(`case_table field "${key}" requires non-empty "cases"`);
      }
      for (const col of field.columns || []) {
        caseColumnNames.add(col.key);
      }
    } else {
      for (const name of fieldExposedNames(field)) globalUnqualified.add(name);
    }
  }

  if (caseTableCount > 1) {
    errors.push('More than one case_table field is not allowed');
  }

  const qualifiedKeysSoFar = new Set();
  const perCaseUnqualifiedSoFar = new Set();
  const moduleIntoPrefixes = [];
  const formulaShowByKey = new Map();
  const formulaPerCaseByKey = new Map();

  function visibleErrorFor(id, visibleSet) {
    if (visibleSet.has(id)) return null;
    if (id.includes('.')) {
      const [ns, rest] = id.split('.');
      if (caseIds.includes(ns) && qualifiedKeysSoFar.has(rest)) return null;
    }
    for (const prefix of moduleIntoPrefixes) {
      if (id.startsWith(`${prefix}_`)) return null;
    }
    if (textFieldKeys.has(id)) {
      return `references text field "${id}"`;
    }
    return `references unknown identifier "${id}"`;
  }

  for (const formula of formulas) {
    if (!formula || typeof formula !== 'object') continue;

    if (formula.module) {
      const fn = getModule(formula.module);
      if (!fn) {
        errors.push(`Unknown module "${formula.module}"`);
      }
      if (formula.into) {
        moduleIntoPrefixes.push(formula.into);
      }
      continue;
    }

    const key = formula.key;
    if (key === undefined) {
      errors.push('Formula missing "key"');
      continue;
    }
    if (!KEY_RE.test(key)) {
      errors.push(`Formula key "${key}" does not match required pattern`);
    }
    if (seenKeys.has(key)) {
      errors.push(`Duplicate key "${key}" across fields/formulas`);
    } else {
      seenKeys.add(key);
    }
    formulaShowByKey.set(key, formula.show !== false);
    formulaPerCaseByKey.set(key, !!formula.per_case);

    let ast = null;
    try {
      ast = parse(formula.expr);
    } catch (e) {
      const code = e instanceof ExprError ? e.code : 'ERROR';
      errors.push(`Formula "${key}" expr parse failure: ${code}: ${e.message}`);
    }

    if (ast) {
      const ids = identifiersOf(ast);
      const visible = formula.per_case
        ? new Set([...globalUnqualified, ...caseColumnNames, ...perCaseUnqualifiedSoFar])
        : globalUnqualified;
      for (const id of ids) {
        const err = visibleErrorFor(id, visible);
        if (err) {
          errors.push(`Formula "${key}" ${err}`);
        }
      }
    }

    if (formula.format && !KNOWN_FORMAT_TYPES.has(formula.format.type)) {
      errors.push(`Formula "${key}" has unknown format.type "${formula.format.type}"`);
    }

    if (formula.per_case) {
      perCaseUnqualifiedSoFar.add(key);
      qualifiedKeysSoFar.add(key);
    } else {
      globalUnqualified.add(key);
    }
  }

  for (const check of checks) {
    if (!check || typeof check !== 'object') continue;
    const key = check.key;
    if (!formulaShowByKey.has(key)) {
      errors.push(`Check references unknown formula "${key}"`);
      continue;
    }
    const expectedPerCase = !!check.per_case;
    const actualPerCase = formulaPerCaseByKey.get(key);
    if (expectedPerCase !== actualPerCase) {
      errors.push(`Check "${key}" per_case mismatch (check=${expectedPerCase}, formula=${actualPerCase})`);
    }
    if (formulaShowByKey.get(key) === false) {
      warnings.push(`Check on formula "${key}" which has show:false`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
