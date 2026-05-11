"use strict";

// One-shot PWA icon generator. Produces two solid placeholder PNGs:
//   public/pwa-192.png  -- 192x192, #1EE3D6 circle on #071018
//   public/pwa-512.png  -- 512x512, same artwork
// Uses only Node built-ins (zlib for DEFLATE) -- no native dependencies.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const BG = [0x07, 0x10, 0x18, 0xff];
const FG = [0x1e, 0xe3, 0xd6, 0xff];
const OUT_DIR = path.join(__dirname, "..", "public");

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

function makePng(size) {
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
      const c = dx * dx + dy * dy <= r2 ? FG : BG;
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

for (const size of [192, 512]) {
  const outPath = path.join(OUT_DIR, `pwa-${size}.png`);
  fs.writeFileSync(outPath, makePng(size));
  const stat = fs.statSync(outPath);
  console.log(`wrote ${outPath} (${size}x${size}, ${stat.size} bytes)`);
}
