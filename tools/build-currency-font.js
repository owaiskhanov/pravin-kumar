// Bundles the Indian rupee sign (U+20B9) as a two-glyph WOFF2 fallback.
// Cormorant Garamond and Jost ship no ₹, so without this the price mark would
// silently fall back to an unknown system font. Both signs are drawn to match
// the document's serif (display) and sans (label) rather than borrowed.
// Dev-only: the output font is committed.
const fs = require('fs');
const opentype = require('opentype.js');
const wawoff2 = require('wawoff2');

const OUT_SERIF = 'assets/fonts/rupee-serif.woff2';
const OUT_SANS = 'assets/fonts/rupee-sans.woff2';
const UPM = 1000;
const SIGN = 0x20b9;

// Real metrics from the bundled faces, so the sign sits on the same baseline
// and matches the cap height / digit width of the surrounding text.
async function metrics(dir, file) {
  const buf = fs.readFileSync(`node_modules/@fontsource/${dir}/files/${file}`);
  const ttf = Buffer.from(await wawoff2.decompress(buf));
  const f = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
  const scale = UPM / f.unitsPerEm;
  const cap = (f.tables.os2 && f.tables.os2.sCapHeight) || Math.round(0.7 * f.unitsPerEm);
  return {
    cap: Math.round(cap * scale),
    digit: Math.round(f.getAdvanceWidth('2', UPM)),
  };
}

// ₹ = top bar, second bar, full-height left stem and a diagonal leg to the
// baseline. Drawn from each face's own cap height and digit width so it sits
// naturally beside the price.
function rupee({ cap, digit, serif }) {
  const H = cap;
  const w = digit + (serif ? 34 : 26);
  const x0 = serif ? 10 : 6;
  const x1 = w - (serif ? 10 : 6);
  const barT = Math.round(H * (serif ? 0.085 : 0.11));
  const stemW = Math.round(H * (serif ? 0.125 : 0.15));
  const bar2Y = Math.round(H * 0.60);
  const legT = Math.round(H * (serif ? 0.115 : 0.14));
  const p = new opentype.Path();

  // top bar
  p.moveTo(x0, H);
  p.lineTo(x1, H);
  p.lineTo(x1, H - barT);
  p.lineTo(x0, H - barT);
  p.closePath();

  // second bar
  p.moveTo(x0, bar2Y);
  p.lineTo(x1, bar2Y);
  p.lineTo(x1, bar2Y - barT);
  p.lineTo(x0, bar2Y - barT);
  p.closePath();

  // stem, full height at the left
  p.moveTo(x0, H);
  p.lineTo(x0 + stemW, H);
  p.lineTo(x0 + stemW, 0);
  p.lineTo(x0, 0);
  p.closePath();

  // leg: from the stem/second-bar junction down to the baseline right
  const legTopY = bar2Y - barT;
  const legX0 = x0 + stemW - Math.round(stemW * 0.15);
  p.moveTo(legX0, legTopY);
  p.lineTo(legX0 + legT, legTopY);
  p.lineTo(x1, 0);
  p.lineTo(x1 - legT, 0);
  p.closePath();

  return { path: p, advance: w + (serif ? 34 : 26) };
}

(async () => {
  const serifM = await metrics('cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2');
  const sansM = await metrics('jost', 'jost-latin-500-normal.woff2');

  const serifSign = rupee({ ...serifM, serif: true });
  const sansSign = rupee({ ...sansM, serif: false });

  const notdef = new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() });
  const font = new opentype.Font({
    familyName: 'Indian Rupee Sign',
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: 900,
    descender: -220,
    glyphs: [
      notdef,
      new opentype.Glyph({ name: 'uni20B9.serif', unicode: SIGN, advanceWidth: serifSign.advance, path: serifSign.path }),
    ],
  });

  const ttf = Buffer.from(font.toArrayBuffer());
  const woff2 = Buffer.from(await wawoff2.compress(ttf));
  fs.writeFileSync(OUT_SERIF, woff2);
  fs.writeFileSync('/tmp/rupee-serif.ttf', ttf); // for the dev preview renderer

  // fallback family for sans contexts is generated from the same outline
  const sansOnly = new opentype.Font({
    familyName: 'Indian Rupee Sign Sans',
    styleName: 'Regular',
    unitsPerEm: UPM, ascender: 900, descender: -220,
    glyphs: [notdef, new opentype.Glyph({ name: 'uni20B9.sans', unicode: SIGN, advanceWidth: sansSign.advance, path: sansSign.path })],
  });
  const sansTtf = Buffer.from(sansOnly.toArrayBuffer());
  const sansWoff2 = Buffer.from(await wawoff2.compress(sansTtf));
  fs.writeFileSync(OUT_SANS, sansWoff2);
  fs.writeFileSync('/tmp/rupee-sans.ttf', sansTtf);

  console.log('wrote', OUT_SERIF, woff2.length, 'bytes |', OUT_SANS, sansWoff2.length, 'bytes');

  // preview: ₹ next to real digits, both faces
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="260" viewBox="0 0 760 260">
  <rect width="760" height="260" fill="#f5eee2"/>
  <text x="40" y="120" font-family="serif" font-size="88" fill="#17120f">25,000</text>
  <text x="40" y="220" font-family="sans-serif" font-size="40" fill="#17120f">25,000 / month</text>
</svg>`;
  fs.writeFileSync('/tmp/rupee-preview.svg', svg);
})();
