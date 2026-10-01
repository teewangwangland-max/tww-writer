import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanNumbers, checkPost, autofix } from '../web/js/engine/numscan.js';
import { compute } from '../web/js/engine/calc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'seed', 'formats', 'feasibility-3case.json'), 'utf8'));
const inputs = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'klos-inputs.json'), 'utf8'));
const fixtureText = fs.readFileSync(path.join(__dirname, 'fixtures', 'klos-post-swapped.txt'), 'utf8');

test('scanNumbers basic cases', () => {
  const tokens = scanNumbers('ส่วนต่าง -43.95 ล้าน (-4.4%)');
  assert.equal(tokens.length, 2);
  assert.equal(tokens[0].value, -43950000);
  assert.equal(tokens[0].decimals, 2);
  assert.equal(tokens[0].cls, 'amount');
  assert.equal(tokens[1].value, -4.4);
  assert.equal(tokens[1].cls, 'percent');
});

test('scanNumbers tidlop word', () => {
  const tokens = scanNumbers('ติดลบ 43.95 ล.');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].value, -43950000);
});

test('scanNumbers skips rai-ngan-wa', () => {
  assert.equal(scanNumbers('1-1-81.7 ไร่').length, 0);
});

test('scanNumbers skips hashtag digits', () => {
  assert.equal(scanNumbers('#ที่ว่างว่าง2024').length, 0);
});

test('scanNumbers k suffix', () => {
  const tokens = scanNumbers('90.2k');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].value, 90200);
});

test('checkPost detects swapped GP mismatches', () => {
  const result = compute(spec, inputs);
  const { issues } = checkPost(fixtureText, spec, result, inputs);
  const mismatches = issues.filter((i) => i.type === 'mismatch');
  assert.equal(mismatches.length, 2, JSON.stringify(mismatches, null, 2));

  const low = mismatches.find((m) => m.checkKey === 'gp' && m.caseId === 'low');
  const mid = mismatches.find((m) => m.checkKey === 'gp' && m.caseId === 'mid');
  assert.ok(low, 'expected gp/low mismatch');
  assert.ok(mid, 'expected gp/mid mismatch');
  assert.ok(low.raw.includes('357.25'));
  assert.equal(low.expected, 318976000);
  assert.ok(mid.raw.includes('318.98'));
});

test('autofix repairs swapped GP and re-check is clean', () => {
  const result = compute(spec, inputs);
  const { issues } = checkPost(fixtureText, spec, result, inputs);
  const fixed = autofix(fixtureText, issues);

  const case1Block = fixed.split('Case 2')[0];
  assert.ok(case1Block.includes('GP 32% = 318.98 ล้าน'), case1Block);

  const case2Block = fixed.split('Case 2')[1].split('Case 3')[0];
  assert.ok(case2Block.includes('GP 32% = 357.25 ล้าน'), case2Block);

  const recheck = checkPost(fixed, spec, result, inputs);
  assert.equal(recheck.issues.filter((i) => i.type === 'mismatch').length, 0);
});

test('second mismatch case: margin edited to wrong value', () => {
  const result = compute(spec, inputs);
  const { issues } = checkPost(fixtureText, spec, result, inputs);
  const fixed = autofix(fixtureText, issues);
  const edited = fixed.replace('+37.38', '+37.83');
  const recheck = checkPost(edited, spec, result, inputs);
  const mismatches = recheck.issues.filter((i) => i.type === 'mismatch');
  assert.equal(mismatches.length, 1, JSON.stringify(mismatches, null, 2));
  assert.equal(mismatches[0].checkKey, 'margin');
  assert.equal(mismatches[0].caseId, 'mid');
});
