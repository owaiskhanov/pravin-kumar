// Static layout mock renders for visual review in sandboxes without a browser.
// Not part of the shipped site — run with `node tools/preview.js`.
const sharp = require('sharp');
const fs = require('fs');
const wawoff2 = require('wawoff2');
const opentype = require('opentype.js');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const INK = '#17120f', SOFT = '#4a413a', MUTED = '#6f645a', RED = '#b8342c',
  BEIGE = '#f5eee2', BEIGE50 = '#faf6ef', LINE = '#ded1bb';

async function load(dir, file) {
  const buf = fs.readFileSync(`node_modules/@fontsource/${dir}/files/${file}`);
  const ttf = Buffer.from(await wawoff2.decompress(buf));
  return opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
}

function wrap(font, text, size, maxW, tracking = 0) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    const width = [...test].reduce((s, c) => s + font.getAdvanceWidth(c, size) + tracking, 0);
    if (width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function text(font, str, size, x, y, { tracking = 0, fill = INK, anchor = 'start' } = {}) {
  const width = [...str].reduce((s, c) => s + font.getAdvanceWidth(c, size) + tracking, 0) - (tracking || 0);
  let cx = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  let out = '';
  for (const ch of str) {
    out += `<path d="${font.getPath(ch, cx, y, size).toPathData(2)}" fill="${fill}"/>`;
    cx += font.getAdvanceWidth(ch, size) + tracking;
  }
  return { svg: out, width };
}

const markD = (() => {
  const s = fs.readFileSync('assets/img/pravin-kumar-mark.svg', 'utf8');
  return [...s.matchAll(/<path fill="(#[0-9a-f]+)"[^>]*d="([^"]+)"/g)].map((m) => ({ fill: m[1], d: m[2] }));
})();
const mv = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(fs.readFileSync('assets/img/pravin-kumar-mark.svg', 'utf8'));
const MW = +mv[1], MH = +mv[2];
const mark = (x, y, w) => `<g transform="translate(${x} ${y}) scale(${w / MW})">${markD.map((p) => `<path d="${p.d}" fill="${p.fill}" fill-rule="evenodd"/>`).join('')}</g>`;

const data = JSON.parse(fs.readFileSync('tools/preview-data.json', 'utf8'));
// ₹ outlines are taken from the bundled glyph font so the mock renders the
// same mark the browser will (the text faces have no rupee sign).
const rupeeGlyph = (() => {
  const cache = {};
  return (which) => {
    if (cache[which]) return cache[which];
    const buf = fs.readFileSync(`assets/fonts/rupee-${which}.woff2`);
    // woff2 -> ttf isn't available synchronously, so use the ttf copies the
    // build script writes to /tmp; fall back to nothing if absent.
    const ttf = fs.readFileSync(`/tmp/rupee-${which}.ttf`);
    const f = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
    void buf;
    const g = f.charToGlyph('\u20B9');
    return (cache[which] = {
      d: (x, y, size) => g.getPath(x, y, size).toPathData(2),
      advance: (size) => f.getAdvanceWidth('\u20B9', size),
    });
  };
})();

(async () => {
  const serif = await load('cormorant-garamond', 'cormorant-garamond-latin-500-normal.woff2');
  const serif600 = await load('cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2');
  const sans = await load('jost', 'jost-latin-400-normal.woff2');
  const sansLight = await load('jost', 'jost-latin-300-normal.woff2');
  const sansMed = await load('jost', 'jost-latin-500-normal.woff2');

  function render({ W, H, pad, cols, scale = 1, stacked }) {
    let out = '';
    const contentW = W - pad * 2;
    const colW = cols === 2 ? (contentW - 28) / 2 : contentW;
    const body = 16 * scale;

    // header
    out += `<rect x="0" y="0" width="${W}" height="${76 * scale}" fill="${BEIGE50}"/>`;
    out += `<rect x="0" y="${76 * scale - 1}" width="${W}" height="1" fill="${LINE}"/>`;
    const mk = 40 * scale;
    out += mark(pad, (76 * scale - mk) / 2, mk);
    out += text(serif600, 'RAVIN KUMAR', 22 * scale, pad + markWidth(mk) + 14 * scale, 48 * scale, { tracking: 2.6 * scale }).svg;
    out += text(sans, 'EST. 1990 · MUMBAI', 10 * scale, W - pad, 45 * scale, { anchor: 'end', tracking: 2.2 * scale, fill: MUTED }).svg;

    let y = 76 * scale + 62 * scale;
    // hero
    out += `<rect x="${pad}" y="${y - 10 * scale}" width="34" height="1.5" fill="${RED}"/>`;
    y += 12 * scale;
    out += text(sans, 'PRAVIN KUMAR & CO · MUMBAI', 11 * scale, pad + 46 * scale, y, { tracking: 2.8 * scale, fill: MUTED }).svg;
    y += 54 * scale;
    const h1 = 62 * scale;
    out += text(serif, 'A focused', h1, pad, y).svg;
    out += text(serif, 'growth plan', h1, pad, y + h1 * 1.02).svg;

    y += h1 * 2.1 + 30 * scale;

    // cards
    const cardPad = 26 * scale;
    const startY = y;
    let maxCardH = 0;
    data.cards.forEach((card, ci) => {
      const x = pad + ci * (colW + 28 * scale);
      const innerW = colW - cardPad * 2;
      let cy = startY + cardPad;
      let svg = '';
      // kicker
      svg += `<circle cx="${x + cardPad + 11 * scale}" cy="${cy + 4 * scale}" r="${12 * scale}" fill="none" stroke="${RED}" stroke-opacity=".35"/>`;
      svg += text(sans, card.index, 9 * scale, x + cardPad + 11 * scale, cy + 8 * scale, { anchor: 'middle', fill: RED }).svg;
      svg += text(sans, card.kicker.toUpperCase(), 9.5 * scale, x + cardPad + 32 * scale, cy + 8 * scale, { tracking: 2 * scale, fill: RED }).svg;
      cy += 34 * scale;
      // title
      svg += text(serif600, card.title, 27 * scale, x + cardPad, cy + 20 * scale).svg;
      cy += 62 * scale;
      // lede
      wrap(sans, card.lede, body * 0.92, innerW).forEach((ln) => {
        svg += text(sans, ln, body * 0.92, x + cardPad, cy, { fill: SOFT }).svg;
        cy += body * 1.45;
      });
      cy += 16 * scale;
      // price
      svg += `<rect x="${x + cardPad}" y="${cy}" width="${innerW}" height="1" fill="${LINE}"/>`;
      cy += 30 * scale;
      {
        const size = 36 * scale;
        const g = rupeeGlyph('serif');
        svg += `<path d="${g.d(x + cardPad, cy, size)}" fill="${INK}"/>`;
        const digitsX = x + cardPad + g.advance(size) + 4 * scale;
        const digits = text(serif600, card.price.replace('₹', ''), size, digitsX + 6 * scale, cy);
        svg += digits.svg;
        svg += text(sans, '/ month', 12 * scale, digitsX + digits.width + 10 * scale, cy - 2 * scale, { fill: MUTED, tracking: 0.6 * scale }).svg;
      }
      cy += 24 * scale;
      wrap(sans, card.note, body * 0.78, innerW).forEach((ln) => {
        svg += text(sans, ln, body * 0.78, x + cardPad, cy, { fill: MUTED }).svg;
        cy += body * 1.25;
      });
      cy += 12 * scale;
      // dropdowns
      card.groups.forEach((g, gi) => {
        const open = gi === 0;
        const boxH = open ? 0 : 44 * scale;
        const rows = g.points.length;
        const collapsedH = 44 * scale;
        const panelH = open ? rows * (body * 1.52) + 20 * scale : 0;
        const h = collapsedH + panelH;
        svg += `<rect x="${x + cardPad}" y="${cy}" width="${innerW}" height="${h}" rx="${11 * scale}" fill="#ffffff" fill-opacity="${open ? 0.7 : 0.42}" stroke="${open ? 'rgba(184,52,44,.45)' : LINE}"/>`;
        svg += text(sans, g.title, body * 0.9, x + cardPad + 15 * scale, cy + 27 * scale).svg;
        svg += text(sans, String(g.points.length), body * 0.72, x + cardPad + innerW - 34 * scale, cy + 27 * scale, { fill: MUTED }).svg;
        const cx = x + cardPad + innerW - 22 * scale, cyy = cy + 22 * scale;
        svg += open
          ? `<path d="M ${cx - 4 * scale} ${cyy - 2 * scale} L ${cx + 4 * scale} ${cyy - 2 * scale} L ${cx} ${cyy + 3 * scale} Z" fill="${SOFT}" transform="translate(0 -1)"/>`
          : `<path d="M ${cx - 4 * scale} ${cyy} L ${cx + 4 * scale} ${cyy} L ${cx} ${cyy + 5 * scale} Z" fill="${SOFT}" opacity=".8"/>`;
        let py = cy + 44 * scale + 14 * scale;
        if (open) {
          g.points.forEach((pt) => {
            if (card.numbered) {
              svg += text(sans, pt[0], body * 0.72, x + cardPad + 15 * scale, py, { fill: RED }).svg;
              svg += text(sans, pt[1], body * 0.87, x + cardPad + 34 * scale, py, { fill: SOFT }).svg;
            } else {
              svg += `<circle cx="${x + cardPad + 18 * scale}" cy="${py - 4 * scale}" r="2.4" fill="${RED}" opacity=".55"/>`;
              svg += text(sans, pt, body * 0.87, x + cardPad + 30 * scale, py, { fill: SOFT }).svg;
            }
            py += body * 1.52;
          });
        }
        cy += h + 10 * scale;
      });
      cy += 6 * scale;
      const cardH = cy - startY + cardPad - 10 * scale;
      maxCardH = Math.max(maxCardH, cardH);
      // card surface first, then its content on top
      out += `<rect x="${x}" y="${startY}" width="${colW}" height="${cardH}" rx="${17 * scale}" fill="${BEIGE}" stroke="${LINE}" stroke-width="1"/>` + svg;
    });

    let cy2 = startY + maxCardH + 54 * scale;
    out += `<rect x="${W / 2 - 21}" y="${cy2}" width="42" height="1" fill="#cdbca0"/>`;
    cy2 += 34 * scale;
    out += text(serif, 'Made to reach the', 40 * scale, W / 2, cy2, { anchor: 'middle' }).svg;
    out += text(serif, 'Correct Audience.', 40 * scale, W / 2, cy2 + 44 * scale, { anchor: 'middle' }).svg;
    cy2 += 44 * scale + 70 * scale;
    out += `<rect x="${pad}" y="${cy2}" width="${contentW}" height="1" fill="${LINE}"/>`;
    out += text(sans, 'Pravin Kumar & Co · Curtains, tapestry & chair fabrics · Mumbai, since 1990', 11 * scale, pad, cy2 + 26 * scale, { fill: MUTED, tracking: 0.3 }).svg;
    out += text(sans, 'pravinkumars.com', 11 * scale, W - pad, cy2 + 26 * scale, { fill: MUTED, anchor: 'end' }).svg;

    const totalH = Math.ceil(cy2 + 50 * scale);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}">
<rect width="${W}" height="${totalH}" fill="${BEIGE50}"/>
<defs><radialGradient id="glow" cx="70%" cy="0%" r="60%"><stop offset="0" stop-color="#f7e9e4"/><stop offset="100%" stop-color="${BEIGE50}" stop-opacity="0"/></radialGradient></defs>
<rect width="${W}" height="${totalH * 0.4}" fill="url(#glow)" opacity=".7"/>
${out}
</svg>`;
    return svg;
  }

  const markW = markWidth(34);
  function markWidth(h) { return h * (MW / MH); }

  for (const cfg of data.viewports) {
    const svg = render(cfg);
    const file = `tools/preview-${cfg.name}.svg`;
    fs.writeFileSync(file, svg);
    await sharp(Buffer.from(svg), { density: 96 }).png().toFile(`/tmp/preview-${cfg.name}.png`);
    console.log('wrote', file);
  }
})();
