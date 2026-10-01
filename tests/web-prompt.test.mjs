import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compute } from '../web/js/engine/index.js';
import { buildWritePrompt, PLAYFULNESS } from '../web/js/prompt/build-write.js';
import { DEFAULT_HOUSE_DNA } from '../web/js/prompt/house-default.js';

const spec = JSON.parse(fs.readFileSync(new URL('../seed/formats/feasibility-3case.json', import.meta.url), 'utf8'));
const inputs = JSON.parse(fs.readFileSync(new URL('./fixtures/klos-inputs.json', import.meta.url), 'utf8'));
const result = compute(spec, inputs);

function build(over = {}) {
  return buildWritePrompt({
    spec, result, inputs,
    narrative: { hook: 'H1', gossip: 'G1', audience: 'A1', assumption_reasons: 'R1' },
    tone: { playfulness: 4, options: ['loft_note', 'page_hashtags'] },
    house: DEFAULT_HOUSE_DNA, personal: null,
    profile: { display_name: 'Bank', catchphrases: 'จัดไป', avoid_list: 'คำหยาบ' },
    examples: { house: { title: 'KLOS', body: 'BODY_H' }, mine: null },
    ...over,
  });
}

test('compute is ok for KLOS fixture', () => {
  assert.equal(result.ok, true);
});

test('prompt contains rules, numbers and per-case ordering', () => {
  const p = build();
  assert.ok(p.includes('ห้ามแก้ ห้ามคำนวณใหม่'));
  for (const t of ['318.98 ล้าน', '357.25 ล้าน', '408.29 ล้าน', '-43.95 ล้าน', '+37.38 ล้าน', '+145.84 ล้าน', '+11.4%',
    '19,545 ตร.ม.', '547.26 ล้าน', '90.2k']) {
    assert.ok(p.includes(t), 'missing ' + t);
  }
  const i1 = p.indexOf('[Case 1 · Low]');
  const i2 = p.indexOf('[Case 2 · Mid]');
  const iNum = p.indexOf('318.98', i1);
  assert.ok(i1 >= 0 && i2 > i1);
  assert.ok(iNum > i1 && iNum < i2, '318.98 sits in Case 1 block');
});

test('11 template headings appear in order', () => {
  const p = build();
  const heads = ['### บทบาท', '### กฎตัวเลข (สำคัญที่สุด)', '### สไตล์ของเพจ (House Style)', '### สไตล์ของผู้เขียน (Bank)',
    '### ตัวอย่างโพสต์', '### ข้อมูลโครงการ', '### ตัวเลขที่คำนวณแล้ว', '### วัตถุดิบเล่าเรื่อง', '### โครงเรื่อง',
    '### คำสั่งเพิ่มเติม', '### รูปแบบคำตอบ'];
  let pos = -1;
  for (const hd of heads) {
    const i = p.indexOf(hd);
    assert.ok(i > pos, 'out of order: ' + hd);
    pos = i;
  }
});

test('13 outline section titles appear in order', () => {
  const p = build();
  assert.equal(spec.sections.length, 13);
  let pos = p.indexOf('### โครงเรื่อง');
  spec.sections.forEach((s, i) => {
    const idx = p.indexOf(`${i + 1}. ${s.title}`);
    assert.ok(idx > pos, 'out of order: ' + s.title);
    pos = idx;
  });
});

test('style, hashtags, examples, narrative', () => {
  const p = build();
  assert.ok(p.includes('4/5 — ' + PLAYFULNESS[4]));
  assert.ok(p.includes('4/5 — ขี้เล่น ภาษาพูด มุกบ่อย'));
  for (const t of DEFAULT_HOUSE_DNA.hashtags) assert.ok(p.includes(t), t);
  assert.ok(p.includes('BODY_H'));
  assert.ok(!p.includes('ตัวอย่างของ Bank'));
  for (const t of ['H1', 'G1', 'A1', 'R1']) assert.ok(p.includes(t));
  assert.ok(p.includes('คำติดปาก: จัดไป'));
  assert.ok(p.includes('สิ่งที่ไม่ใช้: คำหยาบ'));
  assert.ok(p.includes('Case 1 · Low / Case 2 · Mid / Case 3 · High'));
});

test('no placeholders leak', () => {
  for (const p of [build(), build({ examples: { house: null, mine: null }, narrative: {}, profile: {} })]) {
    assert.ok(!/undefined|null|NaN|\[object Object\]/.test(p));
    assert.ok(!/\n{3,}/.test(p));
    assert.ok(!/[ \t]+$/m.test(p));
  }
});

test('no tone options removes extra-instructions section and hashtag line', () => {
  const p = build({ tone: { playfulness: 4, options: [] } });
  assert.ok(!p.includes('### คำสั่งเพิ่มเติม'));
  assert.ok(!p.includes('Hashtag ประจำเพจ'));
});

test('no examples removes the examples section; personal example is labelled', () => {
  const none = build({ examples: { house: null, mine: null } });
  assert.ok(!none.includes('### ตัวอย่างโพสต์'));
  const mine = build({ examples: { house: null, mine: { title: 'T', body: 'BODY_M' } } });
  assert.ok(mine.includes('--- ตัวอย่างของ Bank: T ---'));
  assert.ok(!mine.includes('ตัวอย่างจากเพจ'));
});
