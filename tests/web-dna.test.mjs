import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDnaPrompt, parseDnaAnswer, diffDna } from '../web/js/prompt/build-dna.js';

const examples = [
  { example_id: 'ex-aaa', title: 'โพสต์ A', body: 'เนื้อหา A ยาวๆ' },
  { example_id: 'ex-bbb', title: 'โพสต์ B', body: 'เนื้อหา B' },
];

test('house prompt: headings in order, examples, project-number rule', () => {
  const p = buildDnaPrompt({ scope: 'HOUSE', isHouse: true, currentDna: { voice: 'x' }, examples });
  const heads = ['### บทบาท', '### สไตล์ปัจจุบัน', '### โพสต์ตัวอย่างใหม่', '### สิ่งที่ต้องทำ', '### รูปแบบคำตอบ'];
  let last = -1;
  for (const h of heads) {
    const i = p.indexOf(h);
    assert.ok(i > last, h);
    last = i;
  }
  assert.ok(p.includes('ของเพจ ที่ว่างว่าง'));
  assert.ok(p.includes('--- [ex-aaa] โพสต์ A ---') && p.includes('เนื้อหา A ยาวๆ'));
  assert.ok(p.includes('--- [ex-bbb] โพสต์ B ---') && p.includes('เนื้อหา B'));
  assert.ok(p.includes('ห้ามใส่ตัวเลข'));
  assert.ok(p.includes('number_rules, hashtags'));
});

test('personal prompt omits number_rules/hashtags; no current DNA says ยังไม่มี', () => {
  const p = buildDnaPrompt({ scope: 'u1', isHouse: false, displayName: 'บิ๊ก', currentDna: null, examples });
  assert.ok(p.includes('ของ บิ๊ก'));
  assert.ok(!p.includes('number_rules'));
  assert.ok(!p.includes('hashtags'));
  assert.ok(p.includes('ยังไม่มี'));
  assert.ok(p.includes('voice, do, dont, signature_phrases'));
});

const answer = '```json\n' + JSON.stringify({
  dna: { voice: ' เพื่อนเล่า ', do: ['a', 'a', ' b ', ''], dont: ['x'], signature_phrases: ['ว้าว'], number_rules: ['n'], hashtags: ['#h'], bogus: 1 },
  changelog: [{ example_id: 'ex-aaa', learned: 'ชอบเปิดด้วยคำถาม' }],
}) + '\n```';

test('parseDnaAnswer happy path (personal drops number_rules/hashtags/unknown)', () => {
  const r = parseDnaAnswer('ได้เลย\n' + answer, { isHouse: false });
  assert.equal(r.ok, true);
  assert.deepEqual(r.dna, { voice: 'เพื่อนเล่า', do: ['a', 'b'], dont: ['x'], signature_phrases: ['ว้าว'] });
  assert.ok(r.changelogText.includes('ex-aaa'));
  assert.ok(r.changelogText.includes('ชอบเปิดด้วยคำถาม'));
});

test('parseDnaAnswer house keeps number_rules/hashtags; titles resolve via map', () => {
  const r = parseDnaAnswer(answer, { isHouse: true, titleMap: { 'ex-aaa': 'โพสต์ A' } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.dna.number_rules, ['n']);
  assert.deepEqual(r.dna.hashtags, ['#h']);
  assert.equal(r.dna.bogus, undefined);
  assert.ok(r.changelogText.startsWith('- โพสต์ A:'));
});

test('parseDnaAnswer errors', () => {
  assert.equal(parseDnaAnswer('{"dna":{"voice":"v"}}', { isHouse: false }).ok, false);
  assert.equal(parseDnaAnswer('{"dna":{"voice":"v"},"changelog":[]}', { isHouse: false }).ok, false);
  assert.equal(parseDnaAnswer('{"dna":{"do":"not array"},"changelog":[{"example_id":"e","learned":"l"}]}', { isHouse: false }).ok, false);
  assert.equal(parseDnaAnswer('{"dna":{"do":[1]},"changelog":[{"example_id":"e","learned":"l"}]}', { isHouse: false }).ok, false);
  assert.equal(parseDnaAnswer('ไม่ใช่ json', { isHouse: false }).ok, false);
  const many = Array.from({ length: 31 }, (_, i) => 'i' + i);
  assert.equal(parseDnaAnswer(JSON.stringify({ dna: { do: many }, changelog: [{ example_id: 'e', learned: 'l' }] }), { isHouse: false }).ok, false);
  assert.equal(parseDnaAnswer(JSON.stringify({ dna: { voice: 'v'.repeat(1001) }, changelog: [{ example_id: 'e', learned: 'l' }] }), { isHouse: false }).ok, false);
});

test('diffDna detects added/removed and voice change', () => {
  const d = diffDna({ voice: 'a', do: ['1', '2'] }, { voice: 'b', do: ['2', '3'], dont: ['z'] });
  const by = Object.fromEntries(d.map((x) => [x.field, x]));
  assert.equal(by.voice.changed, true);
  assert.deepEqual(by.do.added, ['3']);
  assert.deepEqual(by.do.removed, ['1']);
  assert.deepEqual(by.dont.added, ['z']);
  assert.equal(by.hashtags.changed, false);
  assert.equal(diffDna({ voice: 'a' }, { voice: 'a' }).every((x) => !x.changed), true);
});
