// Render the app icon (sunrise over pre-dawn horizon) as PNGs without any
// image libraries: raw RGBA pixels -> zlib deflate -> hand-built PNG chunks.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The sunrise mark fits inside the centered 80%-diameter maskable safe zone.
const SKY = [0x11, 0x39, 0x43];
const SUN = [0xf2, 0xc4, 0x77];
const HORIZON = [0xdb, 0xf0, 0xf1];
const REFLECTION = [0x8d, 0xc9, 0xcd];
const rays = [
  [256, 130, 256, 162],
  [157, 172, 179, 194],
  [355, 172, 333, 194],
];
const lines = [
  [120, 269, 392, 269, 10, HORIZON],
  [168, 312, 344, 312, 8, REFLECTION],
  [207, 351, 305, 351, 6, REFLECTION],
];

function segmentDistance(x, y, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - x1 - dx * t, y - y1 - dy * t);
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const coverage = (distance, radius) => Math.max(0, Math.min(1, 0.5 + (radius - distance) * scale));
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = (column + 0.5) / scale, y = (row + 0.5) / scale;
      let color = SKY;
      const paint = (ink, alpha) => {
        if (alpha > 0) color = color.map((value, i) => Math.round(value + (ink[i] - value) * alpha));
      };
      if (y <= 269) paint(SUN, coverage(Math.hypot(x - 256, y - 269), 68));
      for (const ray of rays) paint(SUN, coverage(segmentDistance(x, y, ray), 8));
      for (const line of lines) paint(line[5], coverage(segmentDistance(x, y, line), line[4]));
      const offset = (row * size + column) * 4;
      pixels.set([...color, 255], offset);
    }
  }
  return pixels;
}

// --- minimal PNG encoder ---
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(S, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const raw = Buffer.alloc(S * (S * 4 + 1));
  for (let y = 0; y < S; y++) {
    raw[y * (S * 4 + 1)] = 0; // filter: none
    px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [size, file] of [[180, "daylight-180.png"], [192, "daylight-192.png"], [512, "daylight-512.png"]]) {
  writeFileSync(join(root, "icons", file), png(size, renderIcon(size)));
  console.log(`wrote icons/${file}`);
}
