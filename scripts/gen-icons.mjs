// Render the app icon (sunrise over pre-dawn horizon) as PNGs without any
// image libraries: raw RGBA pixels -> zlib deflate -> hand-built PNG chunks.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Use Morning Brief's night palette, with the original filled sunrise silhouette.
const SKY = [0x14, 0x22, 0x28];
const HALO = [0x28, 0x46, 0x4e];
const SUN = [0xf5, 0xbd, 0x70];
const WATER = [0x20, 0x39, 0x43];
const REFLECTION = [0x83, 0xa9, 0xb5];
const HORIZON_Y = 331;

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = size / 512;
  const coverage = (signedDistance) => Math.max(0, Math.min(1, 0.5 + signedDistance * scale));

  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = (column + 0.5) / scale;
      const y = (row + 0.5) / scale;
      const distanceFromSun = Math.hypot(x - 256, y - HORIZON_Y);
      let color = SKY;
      const paint = (ink, opacity) => {
        if (opacity > 0) color = color.map((value, i) => Math.round(value + (ink[i] - value) * opacity));
      };

      paint(HALO, coverage(180 - distanceFromSun));
      paint(SUN, coverage(142 - distanceFromSun));
      paint(WATER, coverage(y - HORIZON_Y));

      const distanceFromReflection = Math.hypot(Math.max(0, Math.abs(x - 256) - 56), y - 369);
      paint(REFLECTION, coverage(5 - distanceFromReflection));
      pixels.set([...color, 255], (row * size + column) * 4);
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

for (const [size, file] of [[180, "sunrise-180.png"], [192, "sunrise-192.png"], [512, "sunrise-512.png"]]) {
  writeFileSync(join(root, "icons", file), png(size, renderIcon(size)));
  console.log(`wrote icons/${file}`);
}
