import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { emptyState, serialize, deserialize, normalizeInputs, projectNameOf, locationOf } from '../web/js/wizard-state.js';

const spec = JSON.parse(fs.readFileSync(new URL('../seed/formats/feasibility-3case.json', import.meta.url), 'utf8'));

test('emptyState fills defaults from spec', () => {
  const s = emptyState(spec, { playfulness_default: 2 });
  assert.equal(s.v, 1);
  assert.equal(s.tone.playfulness, 2);
  assert.deepEqual(s.tone.options, []);
  assert.deepEqual(s.inputs.case_inputs, { low: { loft_pct: 0 }, mid: { loft_pct: 30 }, high: { loft_pct: 70 } });
  assert.equal(s.inputs.loft_factor, 1.4);
  assert.equal(s.inputs.bonus_pct, 0);
  assert.deepEqual(s.inputs.comps, []);
  assert.equal(s.postId, null);
  assert.equal(s.formatId, 'feasibility-3case');
  assert.equal(s.step, 1);
});

test('playfulness falls back to 3', () => {
  assert.equal(emptyState(spec, {}).tone.playfulness, 3);
  assert.equal(emptyState(spec, null).tone.playfulness, 3);
});

test('serialize/deserialize round-trip', () => {
  const s = emptyState(spec, { playfulness_default: 5 });
  s.inputs.project_name = 'KLOS';
  s.body = 'hello';
  assert.deepEqual(deserialize(serialize(s)), s);
  assert.equal(deserialize('not json'), null);
  assert.equal(deserialize(''), null);
  assert.equal(deserialize(JSON.stringify({ v: 2 })), null);
});

test('normalizeInputs drops blank rai/comps; helpers read names', () => {
  const s = emptyState(spec, {});
  s.inputs.comps = [{ name: '', price_per_sqm: '' }];
  const n = normalizeInputs(spec, s.inputs);
  assert.ok(!('plot' in n));
  assert.ok(!('comps' in n));
  s.inputs.project_name = ' KLOS ';
  s.inputs.location = 'บางแค';
  assert.equal(projectNameOf(spec, s.inputs), 'KLOS');
  assert.equal(locationOf(spec, s.inputs), 'บางแค');
});
