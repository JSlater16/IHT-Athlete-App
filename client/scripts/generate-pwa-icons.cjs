"use strict";

// PWA icon generator. Renders 192/512 PNG icons by fitting the IHT
// logo onto the brand background with ~12% padding.
//
// Override the source with PWA_ICON_SOURCE=<path>.
// When sharp is unavailable, falls back to a procedural placeholder
// (#1EE3D6 circle on #071018) so the build still succeeds.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BG_HEX = "#071018";
const BG_RGBA = { r: 0x07, g: 0x10, b: 0x18, alpha: 1 };
const FALLBACK_FG = [0x1e, 0xe3, 0xd6, 0xff];
const FALLBACK_BG = [0x07, 0x10, 0x18, 0xff];

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const SOURCE = process.env.PWA_ICON_SOURCE || path.join(PUBLIC_DIR, "iht-logo.png");
const SIZES = [192, 512];
const PADDING_RATIO = 0.12;

async function renderWithSharp(size) {
  const sharp = require("sharp");
  const inner = Math.round(size * (1 - PADDING_RATIO * 2));
  const logo = await sharp(SOURCE)
    .resize({ width: inner, height: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const composed = await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG_RGBA,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return composed;
}

// ---- Pure-Node fallback (used only if sharp fails to load) ----

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function renderFallback(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const cx = size / 2 - 0.5;
  const cy = size / 2 - 0.5;
  const radius = size * 0.36;
  const r2 = radius * radius;

  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const c = dx * dx + dy * dy <= r2 ? FALLBACK_FG : FALLBACK_BG;
      const off = y * stride + 1 + x * 4;
      raw[off] = c[0];
      raw[off + 1] = c[1];
      raw[off + 2] = c[2];
      raw[off + 3] = c[3];
    }
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

(async () => {
  let useSharp = true;
  try {
    require.resolve("sharp");
  } catch {
    useSharp = false;
  }

  if (useSharp && !fs.existsSync(SOURCE)) {
    console.warn(`Source not found at ${SOURCE}; using procedural placeholder.`);
    useSharp = false;
  }

  console.log(useSharp ? `Rendering from ${SOURCE} on ${BG_HEX}` : "Rendering procedural placeholder");

  for (const size of SIZES) {
    const outPath = path.join(PUBLIC_DIR, `pwa-${size}.png`);
    const buffer = useSharp ? await renderWithSharp(size) : renderFallback(size);
    fs.writeFileSync(outPath, buffer);
    console.log(`wrote ${outPath} (${size}x${size}, ${buffer.length} bytes)`);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
