#!/usr/bin/env node
/* eslint-disable no-console -- this file reports packed-consumer evidence */

import { createRequire } from "node:module";
import { resolve } from "node:path";

const packageRoot = process.argv[2];

if (!packageRoot) {
  console.error("Usage: node verify-sharp-runtime.mjs <installed-lex-package-root>");
  process.exit(2);
}

const requireFromLex = createRequire(resolve(packageRoot, "package.json"));
const sharp = requireFromLex("sharp");
const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>'
);
const png = await sharp(svg).png().toBuffer();
const expectedSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

if (!png.subarray(0, expectedSignature.length).equals(expectedSignature)) {
  throw new Error("sharp did not generate a valid PNG signature");
}

console.log(
  JSON.stringify({
    sharp: sharp.versions.sharp,
    libvips: sharp.versions.vips,
    outputBytes: png.length,
    pngSignature: png.subarray(1, 4).toString("ascii"),
  })
);
