import test from 'node:test';
import assert from 'node:assert/strict';
import { thaiShortDate, postStatusLabel, verdictColor, parseSummary } from '../web/js/format-th.js';

test('thaiShortDate uses Bangkok time and Buddhist 2-digit year', () => {
  assert.equal(thaiShortDate('2026-09-28T17:30:00Z'), '29 ก.ย. 69');
  assert.equal(thaiShortDate('2026-01-05T03:00:00Z'), '5 ม.ค. 69');
  assert.equal(thaiShortDate(''), '');
  assert.equal(thaiShortDate('garbage'), '');
});

test('postStatusLabel', () => {
  assert.equal(postStatusLabel('draft'), 'ร่าง');
  assert.equal(postStatusLabel('ready'), 'พร้อมโพสต์');
  assert.equal(postStatusLabel('posted'), 'โพสต์แล้ว');
  assert.equal(postStatusLabel('weird'), 'weird');
});

test('verdictColor', () => {
  assert.equal(verdictColor('ไม่รอด'), '#B3261E');
  assert.equal(verdictColor('รอด'), '#4F6128');
  assert.equal(verdictColor('คุ้ม'), '#2F3B14');
  assert.equal(verdictColor('อื่น'), null);
});

test('parseSummary splits verdict words, ไม่รอด kept whole', () => {
  const segs = parseSummary('Case 1 · Low ไม่รอด · Case 2 · Mid รอด · Case 3 · High คุ้ม');
  assert.deepEqual(segs.filter((s) => s.verdict).map((s) => s.verdict), ['ไม่รอด', 'รอด', 'คุ้ม']);
  assert.ok(!segs.some((s) => s.text === 'ไม่'));
  assert.equal(segs.map((s) => s.text).join(''), 'Case 1 · Low ไม่รอด · Case 2 · Mid รอด · Case 3 · High คุ้ม');
  assert.deepEqual(parseSummary(''), []);
});
