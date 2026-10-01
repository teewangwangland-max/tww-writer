import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compute } from '../web/js/engine/calc.js';
import { formatNumberPart } from '../web/js/engine/format.js';
import { registerModule, clearModules } from '../web/js/engine/modules.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'formats', 'feasibility-3case.json'), 'utf8'));
const inputs = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'klos-inputs.json'), 'utf8'));

function findFormula(key) {
  return spec.formulas.find((f) => f.key === key);
}

function displayOf(result, key) {
  const formula = findFormula(key);
  return formatNumberPart(result.values[key], formula.format);
}

function displayOfCase(result, caseId, key) {
  const formula = findFormula(key);
  return formatNumberPart(result.values[`${caseId}.${key}`], formula.format);
}

test('KLOS golden values', () => {
  const result = compute(spec, inputs);
  assert.equal(result.ok, true, JSON.stringify(result.errors));

  assert.equal(displayOf(result, 'land_sqwa'), '581.7');
  assert.equal(displayOf(result, 'land_sqm'), '2,326.8');
  assert.equal(displayOf(result, 'gfa'), '19,545');
  assert.equal(displayOf(result, 'nsa_base'), '9,968');
  assert.equal(displayOf(result, 'construction_cost'), '547.26');
  assert.equal(displayOf(result, 'land_cost'), '174.51');
  assert.equal(displayOf(result, 'comps_avg_view'), '90.2');
  assert.equal(displayOf(result, 'comps_min_view'), '78');
  assert.equal(displayOf(result, 'comps_max_view'), '105');

  assert.equal(displayOfCase(result, 'low', 'nsa'), '9,968');
  assert.equal(displayOfCase(result, 'low', 'pv'), '996.8');
  assert.equal(displayOfCase(result, 'low', 'gp'), '318.98');
  assert.equal(displayOfCase(result, 'low', 'budget'), '677.82');
  assert.equal(displayOfCase(result, 'low', 'margin'), '-43.95');
  assert.equal(displayOfCase(result, 'low', 'margin_pct'), '-4.4');
  assert.equal(result.values['low.status'], 'ไม่รอด');

  assert.equal(displayOfCase(result, 'mid', 'nsa'), '11,164');
  assert.equal(displayOfCase(result, 'mid', 'pv'), '1,116.4');
  assert.equal(displayOfCase(result, 'mid', 'gp'), '357.25');
  assert.equal(displayOfCase(result, 'mid', 'budget'), '759.15');
  assert.equal(displayOfCase(result, 'mid', 'margin'), '+37.38');
  assert.equal(displayOfCase(result, 'mid', 'margin_pct'), '+3.3');
  assert.equal(result.values['mid.status'], 'รอด');

  assert.equal(displayOfCase(result, 'high', 'nsa'), '12,759');
  assert.equal(displayOfCase(result, 'high', 'pv'), '1,275.9');
  assert.equal(displayOfCase(result, 'high', 'gp'), '408.29');
  assert.equal(displayOfCase(result, 'high', 'budget'), '867.61');
  assert.equal(displayOfCase(result, 'high', 'margin'), '+145.84');
  assert.equal(displayOfCase(result, 'high', 'margin_pct'), '+11.4');
  assert.equal(result.values['high.status'], 'คุ้ม');

  assert.equal(result.summary, 'Case 1 · Low ไม่รอด · Case 2 · Mid รอด · Case 3 · High คุ้ม');
});

test('missing required field produces MISSING_INPUT and DEPENDENCY', () => {
  const badInputs = { ...inputs };
  delete badInputs.far;
  const result = compute(spec, badInputs);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.key === 'far' && e.code === 'MISSING_INPUT'));
  assert.ok(result.errors.some((e) => e.key === 'gfa' && e.code === 'DEPENDENCY'));
});

test('module formula', () => {
  registerModule('double', (args) => ({ x: args.n * 2 }));
  const moduleSpec = {
    schema_version: 1,
    id: 'module-test',
    name: 'Module test',
    fields: [],
    cases: [],
    formulas: [
      { module: 'double', args: { n: 21 }, into: 'm' }
    ],
    sections: [],
    checks: []
  };
  const result = compute(moduleSpec, {});
  assert.equal(result.values.m_x, 42);
  clearModules();
});
