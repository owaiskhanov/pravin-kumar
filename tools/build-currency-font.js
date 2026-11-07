// Bundles a proper Indian rupee sign (U+20B9) as two single-glyph WOFF2 faces.
//
// Neither Cormorant Garamond nor Jost contains ₹, and the rupee glyph inside the
// Cormorant family is an italic Latin supplement — not usable next to the upright
// price. So the sign is taken from the Noto families (the standard reference
// outlines for this glyph), metric-matched to the document faces:
//   - scaled to each document face's cap height
//   - spaced with a little extra sidebearing, since a currency mark is usually
//     set slightly lighter than a digit
// Dev-only: the generated faces are committed.
const fs = require('fs');
const opentype = require('opentype.js');
const wawoff2 = require('wawoff2');

const OUT_SERIF = 'assets/fonts/rupee-serif.woff2';
const OUT_SANS = 'assets/fonts/rupee-sans.woff2';
const SOURCES = {
  // target face to match  ->  { donor family, donor file, extra tracking }
  serif: {
    // Cormorant's figures are feather-light, so the sign is matched to their
    // measured ink height and drawn from the light Noto Serif outlines.
    doc: ['cormorant-garamond', 'cormorant-garamond-latin-600-normal.woff2'],
    donor: ['noto-serif', 'noto-serif-latin-ext-200-normal.woff2'],
    match: 'digit-ink',   // scale to the height of the digits, not cap height
    weight: 1.0,
  },
  sans: {
    doc: ['jost', 'jost-latin-500-normal.woff2'],
    donor: ['noto-sans', 'noto-sans-latin-ext-300-normal.woff2'],
    match: 'cap',         // Jost is geometric; cap height is the right guide
    weight: 1.0,
  },
};
const UPM = 1000;
const SIGN = 0x20b9;
const SIGN_CHAR = '\u20B9';

async function load(dir, file) {
  const woff2 = fs.readFileSync(`node_modules/@fontsource/${dir}/files/${file}`);
  const ttf = Buffer.from(await wawoff2.decompress(woff2));
  return opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
}

const capHeight = (font) => {
  const os2 = font.tables.os2 || {};
  return os2.sCapHeight || Math.round(0.7 * font.unitsPerEm);
};

// Height of a reference figure in the document face, in font units.
function digitInkHeight(font) {
  const p = font.charToGlyph('0').getPath(0, 0, font.unitsPerEm);
  const ys = p.commands.flatMap((c) => [c.y, c.y1, c.y2]).filter(Number.isFinite);
  return Math.max(...ys) - Math.min(...ys);
}

// opentype.js writes CFF (PostScript) outlines, so the natural cubic curves of
// the Noto reference can be carried straight through — no lossy quadratic
// approximation. Each segment is rebuilt explicitly to guarantee valid curves.
function rebuildPath(commands, transform, shiftX, scale) {
  const out = new opentype.Path();
  let cursor = [0, 0];
  for (const c of commands) {
    const tx = (v) => (Number.isFinite(v) ? scale(v) + shiftX : v);
    const ty = (v) => (Number.isFinite(v) ? scale(v) : v);
    if (c.type === 'M') { out.moveTo(tx(c.x), ty(c.y)); cursor = [c.x, c.y]; }
    else if (c.type === 'L') { out.lineTo(tx(c.x), ty(c.y)); cursor = [c.x, c.y]; }
    else if (c.type === 'Q') { out.quadraticCurveTo(tx(c.x1), ty(c.y1), tx(c.x), ty(c.y)); cursor = [c.x, c.y]; }
    else if (c.type === 'C') { out.bezierCurveTo(tx(c.x1), ty(c.y1), tx(c.x2), ty(c.y2), tx(c.x), ty(c.y)); cursor = [c.x, c.y]; }
    else if (c.type === 'Z') out.closePath();
    else throw new Error(`unexpected path command: ${c.type}`);
    void cursor; void transform;
  }
  return out;
}

// Rebuild the donor glyph so it matches the document face, keeping the weight
// and contrast of the reference outlines.
function matchedGlyph(doc, donor, match) {
  const docCap = capHeight(doc);
  const donorCap = capHeight(donor);
  const targetH = match === 'digit-ink' ? digitInkHeight(doc) : docCap;
  const donorGlyph = donor.charToGlyph(SIGN_CHAR);

  // size 1em => coordinates in donor font units; y runs down, so flip it back
  const donorPath = donorGlyph.getPath(0, 0, donor.unitsPerEm);
  if (!donorPath.commands.length) throw new Error('donor ₹ has no outlines');
  const commands = donorPath.commands.map((c) => ({
    ...c,
    y: Number.isFinite(c.y) ? -c.y : c.y,
    y1: Number.isFinite(c.y1) ? -c.y1 : c.y1,
    y2: Number.isFinite(c.y2) ? -c.y2 : c.y2,
  }));

  const unitScale = (UPM / donor.unitsPerEm) * (targetH / donorCap);
  const xs = commands.flatMap((c) => [c.x, c.x1, c.x2]).filter(Number.isFinite);
  const xMin = Math.min(...xs) * unitScale;
  const xMax = Math.max(...xs) * unitScale;
  const sidebearing = Math.round(docCap * 0.105);
  const shiftX = sidebearing - xMin;

  const path = rebuildPath(commands, null, shiftX, (v) => v * unitScale);
  const ys = path.commands.flatMap((c) => [c.y, c.y1, c.y2]).filter(Number.isFinite);

  return {
    path,
    advance: Math.round(xMax - xMin + sidebearing * 2),
    cap: docCap,
    inkWidth: Math.round(xMax - xMin),
    inkHeight: Math.round(Math.max(...ys) - Math.min(...ys)),
    segments: path.commands.length,
    curves: path.commands.filter((c) => c.type === 'C' || c.type === 'Q').length,
  };
}

function buildFace(family, glyph) {
  const notdef = new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() });
  return new opentype.Font({
    familyName: family,
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: 800,
    descender: -220,
    glyphs: [
      notdef,
      new opentype.Glyph({ name: 'uni20B9', unicode: SIGN, advanceWidth: glyph.advance, path: glyph.path }),
    ],
  });
}

(async () => {
  const out = {};
  for (const [which, cfg] of Object.entries(SOURCES)) {
    const doc = await load(...cfg.doc);
    const donor = await load(...cfg.donor);
    const glyph = matchedGlyph(doc, donor, cfg.match);
    const font = buildFace(which === 'serif' ? 'Rupee Serif' : 'Rupee Sans', glyph);
    const ttf = Buffer.from(font.toArrayBuffer());
    const woff2 = Buffer.from(await wawoff2.compress(ttf));
    fs.writeFileSync(which === 'serif' ? OUT_SERIF : OUT_SANS, woff2);
    fs.writeFileSync(`/tmp/rupee-${which}.ttf`, ttf); // dev preview renderer
    out[which] = { ...glyph, bytes: woff2.length };
  }

  console.log(
    `serif ₹ ink ${out.serif.inkWidth}x${out.serif.inkHeight} adv ${out.serif.advance} ` +
    `(${out.serif.segments} seg, ${out.serif.curves} curves, ${out.serif.bytes} B) · ` +
    `sans ₹ ink ${out.sans.inkWidth}x${out.sans.inkHeight} adv ${out.sans.advance} ` +
    `(${out.sans.segments} seg, ${out.sans.curves} curves, ${out.sans.bytes} B)`
  );
})();
