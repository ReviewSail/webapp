/**
 * Rasterise the brand SVGs to PNG.
 *
 *   npm run icons
 *
 * The SVGs in public/ are the source of truth; every PNG here is generated.
 * Re-run this after editing icon.svg, favicon.svg or icon-mark.svg.
 *
 * Two things worth knowing if you touch this:
 *
 *  - macOS `qlmanage` can rasterise SVG without any dependency, but it
 *    composites transparency onto white, so it cannot produce icon-mark's
 *    transparent background. That is why sharp is a devDependency.
 *  - Density has to be derived from each file's intrinsic width, not fixed.
 *    librsvg rasterises at `intrinsic * density / 72` before sharp resizes, so
 *    a fixed high density blows past sharp's pixel limit on the 1024pt source.
 */
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const JOBS = [
  ['public/icon.svg',      'public/icon-512.png',       512],
  ['public/icon.svg',      'public/icon-192.png',       192],
  ['public/favicon.svg',   'public/icon-32.png',         32],
  ['public/favicon.svg',   'public/icon-16.png',         16],
  ['public/icon-mark.svg', 'public/icon-mark-1024.png', 1024],
  ['public/icon-mark.svg', 'public/icon-mark-2048.png', 2048],
  ['design/reviewsail-mark.svg', 'design/reviewsail-mark.png', null],
];

const intrinsicWidth = (file) => {
  const m = readFileSync(file, 'utf8').match(/<svg[^>]*\swidth="(\d+)"/);
  return m ? Number(m[1]) : 64;
};

for (const [src, dst, size] of JOBS) {
  const density = Math.min((72 * (size ?? intrinsicWidth(src))) / intrinsicWidth(src), 2400);
  let pipeline = sharp(src, { density });
  if (size) {
    pipeline = pipeline.resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
  const buf = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(dst, buf);
  const { width, height, hasAlpha } = await sharp(buf).metadata();
  console.log(
    `${dst.padEnd(34)}${`${width}x${height}`.padEnd(12)}alpha=${hasAlpha}  ${(buf.length / 1024).toFixed(1)}KB`
  );
}
