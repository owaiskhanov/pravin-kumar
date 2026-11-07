// Builds crisp SVG brand assets from the official raster logo.
//  1. isolates + traces the "pk" monogram
//  2. rebuilds the "RAVIN KUMAR / & CO" wordmark as real vector outlines
// Output: assets/img/pravin-kumar-logo.svg, assets/img/pravin-kumar-mark.svg
const sharp = require('sharp');
const potrace = require('potrace');
const fs = require('fs');
const path = require('path');

const BLACK = '#17120f';
const RED = '#b8342c';
const SRC = 'assets/brand/pravin-kumar-logo-source.png';
const SCALE = 12;

const trace = (buf) => new Promise((res, rej) =>
  potrace.trace(buf, { threshold: 128, turdSize: 2, optCurve: true, optTolerance: 0.15, alphaMax: 1 },
    (e, svg) => e ? rej(e) : res([...svg.matchAll(/<path[^>]*d="([^"]+)"/g)].map(m => m[1]).join(' '))));

async function monogram() {
  const up = await sharp(SRC).resize(120 * SCALE, 94 * SCALE, { kernel: 'lanczos3' }).flatten({ background: '#fff' }).png().toBuffer();
  const { data, info } = await sharp(up).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  // monogram occupies the top ~66% of the artwork; wordmark below is rebuilt as type
  const cut = Math.round(h * 0.705);
  const red = Buffer.alloc(w * cut * 3, 255), blk = Buffer.alloc(w * cut * 3, 255);
  let minx = w, miny = cut, maxx = 0, maxy = 0;
  for (let y = 12; y < cut - 12; y++) for (let x = 12; x < w - 12; x++) {
    const i = (y * w + x) * c, r = data[i], g = data[i + 1], b = data[i + 2];
    const isRed = r > 110 && r - g > 45 && r - b > 45;
    const isDark = !isRed && (0.299 * r + 0.587 * g + 0.114 * b) < 150;
    const o = ((y - 0) * w + x) * 3;
    if (isRed) { red[o] = red[o + 1] = red[o + 2] = 0; }
    if (isDark) { blk[o] = blk[o + 1] = blk[o + 2] = 0; }
    if (isRed || isDark) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
  }
  const cropW = maxx - minx + 1, cropH = maxy - miny + 1;
  const crop = (buf) => sharp(buf, { raw: { width: w, height: cut, channels: 3 } })
    .extract({ left: minx, top: miny, width: cropW, height: cropH }).png().toBuffer();
  const [rd, bd] = await Promise.all([trace(await crop(red)), trace(await crop(blk))]);
  return { rd, bd, w: cropW, h: cropH };
}

async function font(file, weight) {
  const woff2 = fs.readFileSync(`node_modules/@fontsource/cormorant-garamond/files/${file}`);
  const ttf = Buffer.from(await require('wawoff2').decompress(woff2));
  const ot = require('opentype.js');
  return ot.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
}

const track = (f, text, size, tracking) =>
  [...text].reduce((s, ch) => s + f.getAdvanceWidth(ch, size) + tracking, 0) - tracking;

function wordmark(f, text, size, tracking, x, baseline) {
  let cx = x, d = '';
  for (const ch of text) {
    d += f.getPath(ch, cx, baseline, size).toPathData(2) + ' ';
    cx += f.getAdvanceWidth(ch, size) + tracking;
  }
  return d.trim();
}

(async () => {
  const m = await monogram();
  const f = await font('cormorant-garamond-latin-600-normal.woff2');

  // ---- mark only (monogram) ----
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.w} ${m.h}" role="img" aria-label="Pravin Kumar and Co monogram">
<path fill="${BLACK}" fill-rule="evenodd" d="${m.bd}"/>
<path fill="${RED}" fill-rule="evenodd" d="${m.rd}"/>
</svg>
`;
  fs.writeFileSync('assets/img/pravin-kumar-mark.svg', mark);

  // ---- full lockup: monogram above, wordmark below ----
  const M = 1000;                       // canvas width
  const markH = 470;
  const markW = Math.round(markH * (m.w / m.h));
  const markX = Math.round((M - markW) / 2);
  const markY = 26;

  const nameSize = 118, nameTrack = 16;
  const name = 'RAVIN KUMAR';
  const a = 'RAVIN', b = 'KUMAR';
  const aW = track(f, a, nameSize, nameTrack), bW = track(f, b, nameSize, nameTrack);
  const spaceW = track(f, ' ', nameSize, nameTrack);
  const totalW = aW + spaceW + bW;
  const nameX = Math.round((M - totalW) / 2);
  const nameY = markY + markH + 132;
  const dBlack = wordmark(f, a, nameSize, nameTrack, nameX, nameY);
  const dRed = wordmark(f, b, nameSize, nameTrack, nameX + aW + spaceW, nameY);

  const coSize = 66, coTrack = 26;
  const co = '& CO';
  const coW = track(f, co, coSize, coTrack);
  const dCo = wordmark(f, co, coSize, coTrack, Math.round((M - coW) / 2), nameY + 96);

  const lockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${M} ${nameY + 120}" role="img" aria-label="Pravin Kumar and Co">
<g transform="translate(${markX} ${markY}) scale(${(markH / m.h).toFixed(4)})">
<path fill="${BLACK}" fill-rule="evenodd" d="${m.bd}"/>
<path fill="${RED}" fill-rule="evenodd" d="${m.rd}"/>
</g>
<path fill="${BLACK}" d="${dBlack}"/>
<path fill="${RED}" d="${dRed}"/>
<path fill="${BLACK}" d="${dCo}"/>
</svg>
`;
  fs.writeFileSync('assets/img/pravin-kumar-logo.svg', lockup);

  // ---- horizontal lockup for the header (mark + wordmark side by side) ----
  const hName = 100, hTrack = 11, hCo = 58, hCoTrack = 22, hGap = 54;
  const hA = 'RAVIN', hB = 'KUMAR';
  const hAW = track(f, hA, hName, hTrack), hBW = track(f, hB, hName, hTrack);
  const hSpace = track(f, ' ', hName, hTrack);
  const hTextW = hAW + hSpace + hBW;
  const hCoW = track(f, '& CO', hCo, hCoTrack);
  const nameBase = 108, coBase = nameBase + hCo + 22;
  const blockH = nameBase + 16;
  const hMarkH = Math.round(blockH * 1.0);
  const hMarkW = Math.round(hMarkH * (m.w / m.h));
  const totalW2 = hMarkW + hGap + hTextW + 8;
  const totalH2 = Math.round(Math.max(hMarkH + 16, coBase + 22));
  const textX = hMarkW + hGap;
  const horizontal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW2} ${totalH2}" role="img" aria-label="Pravin Kumar and Co">
<g transform="translate(0 8) scale(${(hMarkH / m.h).toFixed(4)})">
<path fill="${BLACK}" fill-rule="evenodd" d="${m.bd}"/>
<path fill="${RED}" fill-rule="evenodd" d="${m.rd}"/>
</g>
<path fill="${BLACK}" d="${wordmark(f, hA, hName, hTrack, textX, nameBase)}"/>
<path fill="${RED}" d="${wordmark(f, hB, hName, hTrack, textX + hAW + hSpace, nameBase)}"/>
<path fill="${BLACK}" d="${wordmark(f, '& CO', hCo, hCoTrack, textX + 4, coBase)}"/>
</svg>
`;
  fs.writeFileSync('assets/img/pravin-kumar-lockup-horizontal.svg', horizontal);

  fs.writeFileSync('assets/img/pravin-kumar-logo-mark.svg', mark.replace('viewBox', 'viewBox'));
  console.log('monogram', m.w, m.h, '| lockup bytes', lockup.length);
  await sharp(Buffer.from(horizontal), { density: 200 }).resize({ height: 120 }).flatten({ background: '#f7f1e7' }).png().toFile('/tmp/horiz.png');
  await sharp(Buffer.from(lockup), { density: 144 }).resize({ width: 900 }).flatten({ background: '#f7f1e7' }).png().toFile('/tmp/lockup.png');
  await sharp(Buffer.from(mark), { density: 144 }).resize({ height: 220 }).flatten({ background: '#f7f1e7' }).png().toFile('/tmp/mark.png');
})();
