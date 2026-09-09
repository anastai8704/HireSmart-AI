/**
 * HireSmart AI — logo asset generator.
 *
 * Renders the "Matchpoint H" mark (brand concept: two people — the two
 * verticals of an H — joined by the bridge of hiring, with the AI "match"
 * moment as the cyan spark at the crossing) into every raster size the
 * product needs. Pure Node (zlib only), deterministic, no dependencies.
 *
 * Usage: node scripts/generate-logo-assets.mjs
 * Outputs (into client/public/):
 *   favicon.ico            16/32/48 (PNG-compressed ICO)
 *   apple-touch-icon.png   180 (full-bleed, iOS applies its own mask)
 *   pwa-192.png            rounded tile on transparency
 *   pwa-512.png            rounded tile on transparency
 *   pwa-512-maskable.png   full-bleed, for the PWA maskable icon slot
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

/* ---------------------------------- colors --------------------------------- */
const GRAD_TOP = [0x6f, 0x64, 0xe3]; // brand-500
const GRAD_BOTTOM = [0x41, 0x39, 0x93]; // brand-800
const WHITE = [0xff, 0xff, 0xff];
const SPARK = [0x67, 0xe8, 0xf9]; // the cyan "match" accent (cyan-300)

/* --------------------------------- geometry --------------------------------
 * Everything is defined on the 24x24 brand grid, then scaled to the target
 * size. Shapes:
 *   tile:     rounded square, corner radius 6.6 (0 for full-bleed renders)
 *   left H:   capsule x 6.4..9.2,  y 5.4..18.6
 *   right H:  capsule x 14.8..17.6, y 5.4..18.6
 *   crossbar: rect     x 6.4..17.6, y 10.6..13.4
 *   sparkle:  8-vertex 4-point star, center (12,12), outer R 3.6, inner r 1.45
 */
const STAR_R = 3.6;
const STAR_r = 1.45;
const c45 = Math.SQRT1_2;
const star = [
  [12, 12 - STAR_R],
  [12 + STAR_r * c45, 12 - STAR_r * c45],
  [12 + STAR_R, 12],
  [12 + STAR_r * c45, 12 + STAR_r * c45],
  [12, 12 + STAR_R],
  [12 - STAR_r * c45, 12 + STAR_r * c45],
  [12 - STAR_R, 12],
  [12 - STAR_r * c45, 12 - STAR_r * c45],
];

/** distance to a segment (world units) */
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
  return Math.hypot(wx - t * vx, wy - t * vy);
}

/**
 * Signed distance to the sparkle polygon (concave). Exact for the winding
 * test; distance is the min over edges (sufficient for antialiasing).
 */
function sparkleSdf(x, y) {
  let d = Infinity, inside = false;
  for (let i = 0; i < star.length; i++) {
    const [ax, ay] = star[i];
    const [bx, by] = star[(i + 1) % star.length];
    d = Math.min(d, segDist(x, y, ax, ay, bx, by));
    // winding-number parity test (crossing number) for concave polygons
    if ((ay > y) !== (by > y)) {
      const t = (y - ay) / (by - ay);
      if (t * (bx - ax) + ax > x) inside = !inside;
    }
  }
  return (inside ? -1 : 1) * d;
}

function roundedRectSdf(x, y, x0, x1, y0, y1, r) {
  // canonical rounded-rect SDF (center-relative)
  const qx = Math.abs(x - (x0 + x1) / 2) - (x1 - x0) / 2 + r;
  const qy = Math.abs(y - (y0 + y1) / 2) - (y1 - y0) / 2 + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function capsuleSdf(x, y, x0, x1, y0, y1) {
  // horizontal/vertical capsule = rounded rect with r = half thickness
  const r = (x1 - x0) / 2;
  return roundedRectSdf(x, y, x0, x1, y0, y1, r);
}

/** smoothstep coverage; w is the antialias band in brand-grid units */
const smooth = (d, w) => {
  const t = 0.5 - d / w + 0.5;
  return Math.max(0, Math.min(1, t));
};

/**
 * Draw one icon into an RGBA buffer.
 * @param {number} size        output pixels
 * @param {object} o           options
 * @param {boolean} o.fullBleed square tile (no rounded corners, no transparency)
 */
function render(size, { fullBleed = false } = {}) {
  const px = new Float64Array(size * size * 4);
  const tileR = fullBleed ? 0 : 6.6;
  const w = 24 / size; // ~1 output pixel antialias band, in grid units
  for (let py = 0; py < size; py++) {
    for (let pxX = 0; pxX < size; pxX++) {
      // 2x2 supersample for clean edges
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const gx = ((pxX + (sx + 0.5) / 2) / size) * 24;
          const gy = ((py + (sy + 0.5) / 2) / size) * 24;
          const dTile = roundedRectSdf(gx, gy, 0, 24, 0, 24, tileR);
          const cover = smooth(dTile, w);
          if (cover <= 0) continue;
          // tile gradient (diagonal)
          const t = Math.max(0, Math.min(1, (gx + gy) / 48));
          let cr = GRAD_TOP[0] + (GRAD_BOTTOM[0] - GRAD_TOP[0]) * t;
          let cg = GRAD_TOP[1] + (GRAD_BOTTOM[1] - GRAD_TOP[1]) * t;
          let cb = GRAD_TOP[2] + (GRAD_BOTTOM[2] - GRAD_TOP[2]) * t;
          // white H
          const dH = Math.min(
            capsuleSdf(gx, gy, 6.4, 9.2, 5.4, 18.6),
            capsuleSdf(gx, gy, 14.8, 17.6, 5.4, 18.6),
            roundedRectSdf(gx, gy, 6.4, 17.6, 10.6, 13.4, 1.0),
          );
          const cH = smooth(dH, w);
          if (cH > 0) {
            cr += (WHITE[0] - cr) * cH;
            cg += (WHITE[1] - cg) * cH;
            cb += (WHITE[2] - cb) * cH;
          }
          // cyan spark on top
          const dS = sparkleSdf(gx, gy);
          const cS = smooth(dS, w);
          if (cS > 0) {
            cr += (SPARK[0] - cr) * cS;
            cg += (SPARK[1] - cg) * cS;
            cb += (SPARK[2] - cb) * cS;
          }
          r += cr * cover;
          g += cg * cover;
          b += cb * cover;
          a += 255 * cover;
        }
      }
      const i = (py * size + pxX) * 4;
      const inv = 1 / 4;
      px[i] = r * inv;
      px[i + 1] = g * inv;
      px[i + 2] = b * inv;
      px[i + 3] = a * inv;
    }
  }
  return px;
}

/* ---------------------------------- PNG ------------------------------------ */
function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.round(rgba[i]);
      raw[o + 1] = Math.round(rgba[i + 1]);
      raw[o + 2] = Math.round(rgba[i + 2]);
      raw[o + 3] = Math.round(rgba[i + 3]);
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** ICO container with PNG-compressed entries (valid on all modern OSes). */
function encodeIco(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(entries.length, 4);
  entries.forEach((e, i) => {
    const o = 6 + i * 16;
    header[o] = e.size >= 256 ? 0 : e.size; // width (0 = 256)
    header[o + 1] = e.size >= 256 ? 0 : e.size; // height
    header[o + 2] = 0; // palette
    header[o + 3] = 0; // reserved
    header.writeUInt16LE(1, o + 4); // planes
    header.writeUInt16LE(32, o + 6); // bpp
    header.writeUInt32LE(e.png.length, o + 8); // byte size
    header.writeUInt32LE(6 + 16 * entries.length, o + 12); // offset
  });
  return Buffer.concat([header, ...entries.map((e) => e.png)]);
}

/* ---------------------------------- build ---------------------------------- */
const targets = [
  ["pwa-192.png", 192, false],
  ["pwa-512.png", 512, false],
  ["pwa-512-maskable.png", 512, true],
  ["apple-touch-icon.png", 180, true],
];
for (const [name, size, fullBleed] of targets) {
  const png = encodePng(size, render(size, { fullBleed }));
  writeFileSync(join(OUT, name), png);
  console.log(`wrote ${name} (${png.length} bytes)`);
}

const icoEntries = [];
for (const size of [16, 32, 48]) {
  const png = encodePng(size, render(size));
  icoEntries.push({ size, png });
}
writeFileSync(join(OUT, "favicon.ico"), encodeIco(icoEntries));
console.log("wrote favicon.ico (16/32/48)");
