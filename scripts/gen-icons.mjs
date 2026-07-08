// Render the app icon (sunrise over pre-dawn horizon) as PNGs without any
// image libraries: raw RGBA pixels -> zlib deflate -> hand-built PNG chunks.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const SKY = [0x0e, 0x14, 0x1d];
const GROUND = [0x16, 0x20, 0x2c];
const SUN = [0xf2, 0xa6, 0x5a];
const GLOW = [0x8a, 0x5f, 0x3a];

function smooth(edge, x) {
  // 0 inside, 1 outside, ~1.5px feather
  const t = Math.min(1, Math.max(0, (x - edge + 0.75) / 1.5));
  return t;
}

function renderIcon(S) {
  const px = Buffer.alloc(S * S * 4);
  const horizonY = S * 0.66;
  const cx = S * 0.5, cy = horizonY, r = S * 0.30;
  const glowR = S * 0.42;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let c = y >= horizonY ? GROUND : SKY;
      const d = Math.hypot(x - cx, y - cy);
      if (y < horizonY) {
        // soft glow behind the sun
        const g = smooth(glowR, d);
        if (g < 1) {
          const a = (1 - g) * 0.45;
          c = c.map((v, i) => Math.round(v * (1 - a) + GLOW[i] * a));
        }
        // sun disc (semicircle above the horizon)
        const s = smooth(r, d);
        if (s < 1) {
          c = c.map((v, i) => Math.round(v * s + SUN[i] * (1 - s)));
        }
      } else {
        // sun reflection stripe below horizon
        const inStripe = Math.abs(x - cx) < r * 0.55 && y < horizonY + S * 0.06;
        if (inStripe) c = c.map((v, i) => Math.round(v * 0.6 + SUN[i] * 0.4));
      }
      const o = (y * S + x) * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
  }
  return px;
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

for (const [size, file] of [[192, "icon-192.png"], [512, "icon-512.png"], [180, "apple-touch-icon.png"]]) {
  writeFileSync(join(root, "icons", file), png(size, renderIcon(size)));
  console.log(`wrote icons/${file}`);
}
