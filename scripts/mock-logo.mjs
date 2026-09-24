// Generates the mock company's logo: a small PNG drawn here, so the repository
// carries no artwork of unclear provenance. Run: npm run mock:logo
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WIDTH = 240;
const HEIGHT = 80;
const ACCENT = [47, 111, 78];
const INK = [31, 41, 51];
const PAPER = [255, 255, 255];

const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
const paint = (x, y, [r, g, b]) => {
  const at = (y * WIDTH + x) * 3;
  pixels[at] = r;
  pixels[at + 1] = g;
  pixels[at + 2] = b;
};

for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    const inMark = x < 72;
    const inChevron = inMark && Math.abs(x - 36) + Math.abs(y - 40) < 22;
    const inBar = !inMark && y > 24 && y < 34 && x < 210;
    const inShortBar = !inMark && y > 44 && y < 54 && x < 160;
    if (inChevron) paint(x, y, PAPER);
    else if (inMark) paint(x, y, ACCENT);
    else if (inBar || inShortBar) paint(x, y, INK);
    else paint(x, y, PAPER);
  }
}

// One filter byte per row, then deflate: the PNG data stream.
const raw = Buffer.alloc(HEIGHT * (WIDTH * 3 + 1));
for (let y = 0; y < HEIGHT; y++) {
  raw[y * (WIDTH * 3 + 1)] = 0;
  pixels.copy(raw, y * (WIDTH * 3 + 1) + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

const crc32 = (buffer) => {
  let value = 0xffffffff;
  for (const byte of buffer) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const header = Buffer.alloc(13);
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8; // bit depth
header[9] = 2; // colour type: RGB

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const target = fileURLToPath(new URL('../render/samples/logo.png', import.meta.url));
writeFileSync(target, png);
console.log(`wrote ${target}: ${png.length} bytes`);
