import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'icons');
const BRICK = [0xA8, 0x43, 0x1F, 255];
const PAPER = [0xF3, 0xEF, 0xE6, 255];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, markScale) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const markSize = size * 0.5 * markScale;
  const stroke = Math.max(2, size * 0.08 * markScale);
  const x0 = (size - markSize) / 2, x1 = x0 + markSize;
  const y0 = x0, y1 = x1;
  const gapW = markSize * 0.34;
  const gx0 = (size - gapW) / 2, gx1 = gx0 + gapW;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const inOuter = x >= x0 && x < x1 && y >= y0 && y < y1;
      const inInner = x >= x0 + stroke && x < x1 - stroke && y >= y0 + stroke && y < y1 - stroke;
      let mark = inOuter && !inInner;
      if (mark && y < y0 + stroke && x >= gx0 && x < gx1) mark = false; // gap in top edge
      const c = mark ? PAPER : BRICK;
      raw.set(c, row + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
const jobs = [
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8],
  ['apple-touch-icon.png', 180, 1],
];
for (const [name, size, scale] of jobs) {
  fs.writeFileSync(path.join(OUT, name), png(size, scale));
  console.log('wrote', name);
}
