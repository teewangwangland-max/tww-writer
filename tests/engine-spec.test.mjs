import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSpec } from '../web/js/engine/spec.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'formats', 'feasibility-3case.json'), 'utf8'));

function clone(s) {
  return JSON.parse(JSON.stringify(s));
}

test('seed spec validates with 0 errors', () => {
  const result = validateSpec(spec);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('seed spec sections/notes/tone_options/narrative_fields shape', () => {
  assert.equal(spec.sections.length, 13);
  assert.equal(spec.notes.length, 2);
  assert.equal(spec.tone_options.length, 3);
  assert.equal(spec.narrative_fields.length, 4);
});

test('unknown identifier in expr', () => {
  const bad = clone(spec);
  const gfa = bad.formulas.find((f) => f.key === 'gfa');
  gfa.expr = 'gfa*unknown_var';
  const result = validateSpec(bad);
  assert.ok(result.errors.some((e) => e.includes('unknown_var')));
});

test('formula referencing a key defined later', () => {
  const bad = clone(spec);
  const landSqwa = bad.formulas.find((f) => f.key === 'land_sqwa');
  landSqwa.expr = 'gfa + 1';
  const result = validateSpec(bad);
  assert.ok(result.errors.length > 0);
});

test('check with unknown key', () => {
  const bad = clone(spec);
  bad.checks.push({ key: 'no_such_formula', keywords: ['x'] });
  const result = validateSpec(bad);
  assert.ok(result.errors.some((e) => e.includes('no_such_formula')));
});

test('unknown field type', () => {
  const bad = clone(spec);
  bad.fields.push({ key: 'weird', label: 'weird', type: 'color' });
  const result = validateSpec(bad);
  assert.ok(result.errors.some((e) => e.includes('color')));
});

test('forbidden identifier in expr', () => {
  const bad = clone(spec);
  const gfa = bad.formulas.find((f) => f.key === 'gfa');
  gfa.expr = 'constructor';
  const result = validateSpec(bad);
  assert.ok(result.errors.length > 0);
});
