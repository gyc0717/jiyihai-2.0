// 把多尺寸 PNG 拼成一个 .ico（每个尺寸各一张，Windows 自己挑）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const OUT = path.join(ROOT, 'docs', 'icon.ico');
const SIZES = [256, 64, 48, 32, 16];

const images = SIZES.map((s) => {
  const buf = fs.readFileSync(path.join(HERE, `icon-${s}.png`));
  return { size: s, buf };
});

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);            // reserved
header.writeUInt16LE(1, 2);            // type: icon
header.writeUInt16LE(images.length, 4); // count

const dirSize = 16 * images.length;
let offset = 6 + dirSize;
const entries = [];
for (const img of images) {
  const e = Buffer.alloc(16);
  e.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // 0 表示 256
  e.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
  e.writeUInt8(0, 2);   // 调色板
  e.writeUInt8(0, 3);   // reserved
  e.writeUInt16LE(1, 4); // planes
  e.writeUInt16LE(32, 6); // bpp
  e.writeUInt32LE(img.buf.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += img.buf.length;
  entries.push(e);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.concat([header, ...entries, ...images.map((i) => i.buf)]));
console.log(`写好了：${OUT}（${SIZES.join('/')}）`);
