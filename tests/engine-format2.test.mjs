import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSpec, compute, checkPost, autofix } from '../web/js/engine/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/rental-yield-spec.json'), 'utf8'));
const post = fs.readFileSync(path.join(ROOT, 'tests/fixtures/rental-yield-post.txt'), 'utf8');
const inputs = spec.sample_inputs;

test('format #2 spec validates with 0 errors', () => {
  const v = validateSpec(spec);
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
});

test('format #2 computes the expected display values', () => {
  const r = compute(spec, inputs);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const num = (k) => r.display[k].replace(/[^\d.,\-+]/g, '').replace(/^\.+|\.+$/g, '');
  assert.equal(num('price_sqm'), '100,000');
  assert.equal(num('rent_year'), '165,000');
  assert.equal(num('common_year'), '25,200');
  assert.equal(num('net_year'), '139,800');
  assert.equal(num('gross_yield'), '5.14');
  assert.equal(num('net_yield'), '3.99');
  assert.equal(num('payback_years'), '25');
  assert.equal(r.display.verdict, 'รอด');
  assert.equal(r.summary, 'รอด');
});

test('format #2 post check: all 7 checks ok, no mismatch or missing', () => {
  const r = compute(spec, inputs);
  const rep = checkPost(post, spec, r, inputs);
  assert.equal(rep.stats.mismatch, 0);
  assert.equal(rep.stats.missing, 0);
  assert.equal(rep.stats.ok, 7);
});

test('format #2: a wrong Net yield is one mismatch and autofix restores it', () => {
  const r = compute(spec, inputs);
  const bad = post.replace('Net yield 3.99%', 'Net yield 4.99%');
  assert.notEqual(bad, post);
  const rep = checkPost(bad, spec, r, inputs);
  const mism = rep.issues.filter((i) => i.type === 'mismatch');
  assert.equal(mism.length, 1);
  assert.equal(mism[0].checkKey, 'net_yield');
  assert.equal(autofix(bad, mism).includes('Net yield 3.99%'), true);
});

test('summary.key must reference a global formula', () => {
  const s = { ...spec, summary: { key: 'nope' } };
  const v = validateSpec(s);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.includes('nope')));
});
