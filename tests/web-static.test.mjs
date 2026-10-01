import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const all = walk(WEB);
const code = all.filter((f) => /\.(js|html|css)$/.test(f));
const textFiles = all.filter((f) => /\.(js|html|css|webmanifest|json)$/.test(f));

test('no forbidden DOM/eval APIs in web code', () => {
  const banned = ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval('];
  for (const f of code) {
    const src = fs.readFileSync(f, 'utf8');
    for (const b of banned) assert.ok(!src.includes(b), `${path.relative(WEB, f)} contains ${b}`);
  }
});

test('no emoji in any web file', () => {
  const re = /\p{Extended_Pictographic}/u;
  for (const f of textFiles) {
    assert.ok(!re.test(fs.readFileSync(f, 'utf8')), `emoji in ${path.relative(WEB, f)}`);
  }
});

function readPng(file) {
  const b = fs.readFileSync(file);
  assert.deepEqual([...b.subarray(0, 8)], [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 'PNG signature');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

test('manifest has required fields and valid icons', () => {
  const m = JSON.parse(fs.readFileSync(path.join(WEB, 'manifest.webmanifest'), 'utf8'));
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'lang']) {
    assert.ok(m[k], `manifest.${k}`);
  }
  assert.equal(m.display, 'standalone');
  assert.equal(m.icons.length, 3);
  for (const i of m.icons) {
    const file = path.join(WEB, i.src);
    assert.ok(fs.existsSync(file), i.src);
    const [w, h] = i.sizes.split('x').map(Number);
    assert.deepEqual(readPng(file), { w, h }, i.src);
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
});

test('apple-touch-icon is 180x180 PNG', () => {
  assert.deepEqual(readPng(path.join(WEB, 'icons/apple-touch-icon.png')), { w: 180, h: 180 });
});

test('every sw.js precache path exists', () => {
  const src = fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8');
  const block = /const SHELL = \[([\s\S]*?)\];/.exec(src);
  assert.ok(block, 'SHELL list');
  const paths = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(paths.length > 10);
  for (const p of paths) {
    assert.ok(fs.existsSync(path.join(WEB, p === './' ? 'index.html' : p)), p);
  }
  for (const f of all.filter((x) => /web[\\/]js[\\/].*\.js$/.test(x))) {
    const rel = path.relative(WEB, f).split(path.sep).join('/');
    assert.ok(paths.includes(rel), `${rel} missing from precache`);
  }
});

test('config API_URL ends with /exec', async () => {
  const { API_URL } = await import('../web/js/config.js');
  assert.ok(API_URL.endsWith('/exec'));
});

test('index.html has no absolute-path assets', () => {
  const html = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8');
  assert.ok(!/(href|src)="\/(?!\/)/.test(html));
});

test('UI files stay spec-driven (no format-specific words)', () => {
  const ui = all.filter((f) => {
    const rel = path.relative(WEB, f).split(path.sep).join('/');
    return /^js\/views\/[^/]+\.js$/.test(rel) || /^js\/(fields|results-view|checker-view)\.js$/.test(rel) || /^js\/wizard[^/]*\.js$/.test(rel);
  });
  assert.ok(ui.length >= 8);
  for (const f of ui) {
    const src = fs.readFileSync(f, 'utf8').toLowerCase();
    for (const w of ['feasibility', 'loft', 'gfa', 'nsa']) {
      assert.ok(!src.includes(w), `${path.relative(WEB, f)} contains "${w}"`);
    }
  }
});

test('fetch( appears only in api.js and sw.js', () => {
  for (const f of all.filter((x) => /\.js$/.test(x))) {
    const rel = path.relative(WEB, f).split(path.sep).join('/');
    if (rel === 'js/api.js' || rel === 'sw.js') continue;
    assert.ok(!fs.readFileSync(f, 'utf8').includes('fetch('), `fetch( in ${rel}`);
  }
});
