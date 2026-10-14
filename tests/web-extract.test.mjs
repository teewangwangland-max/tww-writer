import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractJson, suggestFormatId } from '../web/js/spec-json.js';
import { buildExtractPrompt } from '../web/js/prompt/build-extract.js';
import { SPEC_SCHEMA_DOC } from '../web/js/prompt/spec-schema-doc.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feas = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed/formats/feasibility-3case.json'), 'utf8'));

test('extractJson: fenced block with prose around', () => {
  const r = extractJson('นี่คือสเปก\n```json\n{"a": 1, "b": {"c": 2}}\n```\nขอบคุณครับ {ไม่ใช่ json}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { a: 1, b: { c: 2 } });
});

test('extractJson: bare object with prose', () => {
  const r = extractJson('ได้เลย {"id": "x", "n": [1,2]} จบ');
  assert.equal(r.ok, true);
  assert.equal(r.value.id, 'x');
});

test('extractJson: smart quotes retried', () => {
  const r = extractJson('{“id”: “x”}');
  assert.equal(r.ok, true);
  assert.equal(r.value.id, 'x');
});

test('extractJson: BOM stripped', () => {
  assert.equal(extractJson('﻿{"a":1}').ok, true);
});

test('extractJson: array and garbage are errors', () => {
  const a = extractJson('[1,2,3]');
  assert.equal(a.ok, false);
  assert.ok(a.error);
  const g = extractJson('ไม่มี json เลย');
  assert.equal(g.ok, false);
  assert.ok(g.error);
  assert.equal(extractJson('').ok, false);
});

test('suggestFormatId uses Bangkok date', () => {
  assert.equal(suggestFormatId(new Date('2026-10-13T20:00:00Z'), 'ab12'), 'fmt-20261014-ab12');
  assert.match(suggestFormatId(new Date(), Math.random()), /^fmt-\d{8}-[a-z0-9]{4}$/);
});

test('buildExtractPrompt: headings in order, markers, example, no junk', () => {
  const p = buildExtractPrompt({ name: 'ทดสอบ', formatId: 'fmt-x', sourcePost: 'โพสต์ ABC 123', exampleSpec: feas, schemaDoc: SPEC_SCHEMA_DOC });
  const heads = ['### บทบาท', '### หน้าที่', '### กติกาของสเปก', '### ตัวอย่างสเปกที่ใช้งานได้จริง', '### ข้อมูลรูปแบบใหม่', '### โพสต์ต้นแบบ', '### รูปแบบคำตอบ'];
  let pos = -1;
  for (const hd of heads) {
    const i = p.indexOf(hd);
    assert.ok(i > pos, `heading ${hd} in order`);
    pos = i;
  }
  assert.ok(p.includes('<<<โพสต์\nโพสต์ ABC 123\nโพสต์>>>'));
  assert.ok(p.includes('"sample_inputs"') || p.includes('sample_inputs'));
  assert.ok(p.includes('"sample_inputs"'), 'quoted sample_inputs');
  assert.ok(p.includes('round(x,dp)'));
  assert.ok(p.includes('"feasibility-3case"'));
  assert.ok(p.includes('ชื่อรูปแบบ: ทดสอบ'));
  assert.ok(p.includes('id: fmt-x'));
  assert.ok(!/undefined|null|\[object Object\]/.test(p));
});

test('buildExtractPrompt: no example section when exampleSpec is null', () => {
  const p = buildExtractPrompt({ name: 'n', formatId: 'fmt-x', sourcePost: 's', exampleSpec: null });
  assert.ok(!p.includes('### ตัวอย่างสเปกที่ใช้งานได้จริง'));
  assert.ok(!/undefined|null|\[object Object\]/.test(p));
  assert.ok(p.includes('round(x,dp)'));
});

test('SPEC_SCHEMA_DOC covers key rules and is at most 120 lines', () => {
  assert.ok(SPEC_SCHEMA_DOC.split('\n').length <= 120);
  for (const w of ['schema_version', 'comps_table', 'case_table', '^[a-z][a-z0-9_]*$', 'per_case', 'markers', 'summary', 'narrative_fields',
    'int | number | million | thousand | percent | text', 'if(cond,a,b)', 'sample_inputs', '_count', 'hook']) {
    assert.ok(SPEC_SCHEMA_DOC.includes(w), w);
  }
});

test('sample_inputs round trip through form inputs', async () => {
  const { inputsToSample, sampleToInputs } = await import('../web/js/spec-json.js');
  const { emptyInputs } = await import('../web/js/wizard-state.js');
  const sample = {
    project_name: 'X', far: 5, plot: '1-1-81.7',
    comps: [{ name: 'A', price_per_sqm: 100000 }],
    case_inputs: { low: { loft_pct: 0 }, mid: { loft_pct: 30 }, high: { loft_pct: 70 } },
  };
  const inputs = sampleToInputs(feas, sample, emptyInputs);
  assert.deepEqual(inputs.plot, { rai: '1', ngan: '1', wa: '81.7' });
  assert.equal(inputs.far, 5);
  const back = inputsToSample(feas, inputs);
  assert.deepEqual(back, { ...sample, bonus_pct: 0, loft_factor: 1.4 });
});
