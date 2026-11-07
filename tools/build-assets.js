// Generates the icon set, manifest icons and the 1200x630 social share image
// from the vector brand lockup (no webfonts needed at render time — all text
// is converted to outlines).
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const wawoff2 = require('wawoff2');
const opentype = require('opentype.js');

const OUT = 'assets/img';
const INK = '#17120f';
const RED = '#b8342c';
const BEIGE = '#f5eee2';
const BEIGE_LIGHT = '#fbf7f0';
const MUTED = '#6f645a';

const mark = fs.readFileSync(`${OUT}/pravin-kumar-mark.svg`, 'utf8');
const markD = [...mark.matchAll(/<path[^>]*d="([^"]+)"[^>]*>/g)].map(m => ({ d: m[1], fill: /fill="(#[0-9a-fA-F]+)"/.exec(m[0])[1] }));
const markView = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(mark);
const MW = +markView[1], MH = +markView[2];

async function loadFont(dir, file) {
  const buf = fs.readFileSync(`node_modules/@fontsource/${dir}/files/${file}`);
  const ttf = Buffer.from(await wawoff2.decompress(buf));
  return opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
}

function textD(font, text, size, tracking, x, baseline) {
  let cx = x, d = '';
  for (const ch of text) {
    d += font.getPath(ch, cx, baseline, size).toPathData(2) + ' ';
    cx += font.getAdvanceWidth(ch, size) + tracking;
  }
  return d.trim();
}
const textW = (font, text, size, tracking) =>
  [...text].reduce((s, c) => s + font.getAdvanceWidth(c, size) + tracking, 0) - tracking;

function markGroup(x, y, w, color) {
  const s = w / MW;
  return `<g transform="translate(${x} ${y}) scale(${s})">${markD
    .map(p => `<path d="${p.d}" fill="${color || p.fill}" fill-rule="evenodd"/>`).join('')}</g>`;
}

function ico(pngs) {
  // pngs: [{size, buf}]
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const entries = [], datas = [];
  let offset = 6 + 16 * pngs.length;
  pngs.forEach(({ size, buf }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2); e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buf.length;
    entries.push(e); datas.push(buf);
  });
  return Buffer.concat([header, ...entries, ...datas]);
}

(async () => {
  /* ---------- icons ---------- */
  const tile = (size, bg, pad, radius) => {
    const inner = size * (1 - pad * 2);
    const w = inner;
    const h = inner * (MH / MW);
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>
${markGroup(x, y, w)}
</svg>`;
  };

  const svgTile = tile(64, BEIGE_LIGHT, 0.13, 12);
  fs.writeFileSync(`${OUT}/favicon.svg`, svgTile);

  const icons = {};
  for (const s of [16, 32, 48, 180, 192, 512]) {
    const svg = tile(s, s >= 180 ? BEIGE : BEIGE_LIGHT, s >= 180 ? 0.16 : 0.1, s >= 180 ? s * 0.2 : s * 0.16);
    icons[s] = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  }
  fs.writeFileSync('favicon.ico', ico([
    { size: 16, buf: icons[16] }, { size: 32, buf: icons[32] }, { size: 48, buf: icons[48] },
  ]));
  fs.writeFileSync(`${OUT}/apple-touch-icon.png`, icons[180]);
  fs.writeFileSync(`${OUT}/icon-192.png`, icons[192]);
  fs.writeFileSync(`${OUT}/icon-512.png`, icons[512]);

  /* ---------- social share image 1200x630 ---------- */
  const cormorant = await loadFont('cormorant-garamond', 'cormorant-garamond-latin-500-normal.woff2');
  const cormorantItalic = await loadFont('cormorant-garamond', 'cormorant-garamond-latin-500-normal.woff2');
  const jost = await loadFont('jost', 'jost-latin-400-normal.woff2');
  const jostLight = await loadFont('jost', 'jost-latin-300-normal.woff2');

  const W = 1200, H = 630;
  const lockupW = 300;
  const lockupH = lockupW * (MH / MW);
  const lockupX = (W - lockupW) / 2;
  const lockupY = 92;

  const title = 'A focused growth plan';
  const titleSize = 62, titleTrack = 0.5;
  const titleW = textW(cormorant, title, titleSize, titleTrack);
  const titleY = lockupY + lockupH + 108;

  const sub = 'SOCIAL MEDIA MANAGEMENT  ·  PERFORMANCE MARKETING';
  const subSize = 15, subTrack = 3.6;
  const subW = textW(jostLight, sub, subSize, subTrack);
  const subY = titleY + 62;

  const brand = 'CURTAINS  ·  TAPESTRY  ·  CHAIR FABRICS  ·  MUMBAI, SINCE 1990';
  const brandSize = 13, brandTrack = 3;
  const brandW = textW(jost, brand, brandSize, brandTrack);
  const brandY = 560;

  const og = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <radialGradient id="g" cx="50%" cy="8%" r="78%">
    <stop offset="0" stop-color="#fdfaf4"/>
    <stop offset="62%" stop-color="${BEIGE}"/>
    <stop offset="100%" stop-color="#efe5d5"/>
  </radialGradient>
</defs>
<rect width="${W}" height="${H}" fill="url(#g)"/>
<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#ded1bb" stroke-width="2"/>
${markGroup(lockupX, lockupY, lockupW)}
<rect x="${W / 2 - 26}" y="${titleY - 52}" width="52" height="1.5" fill="${RED}" opacity=".55"/>
<path d="${textD(cormorant, title, titleSize, titleTrack, (W - titleW) / 2, titleY)}" fill="${INK}"/>
<path d="${textD(jostLight, sub, subSize, subTrack, (W - subW) / 2, subY)}" fill="${MUTED}"/>
<path d="${textD(jost, brand, brandSize, brandTrack, (W - brandW) / 2, brandY)}" fill="${MUTED}" opacity=".85"/>
</svg>`;
  fs.writeFileSync(`${OUT}/og-cover.svg`, og);
  await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toFile(`${OUT}/og-cover.png`);

  /* ---------- manifest ---------- */
  fs.writeFileSync('manifest.webmanifest', JSON.stringify({
    name: 'A focused growth plan · Pravin Kumar & Co',
    short_name: 'Pravin Kumar',
    description: 'Social media management and performance marketing plan for Pravin Kumar & Co.',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#f5eee2',
    theme_color: '#f5eee2',
    icons: [
      { src: 'assets/img/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'assets/img/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'assets/img/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  }, null, 2) + '\n');

  console.log('assets built');
})();
