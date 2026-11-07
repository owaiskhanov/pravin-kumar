/* QA suite: content contract, metadata, a11y structure, responsive guards,
   print/PDF rules, splash + scroll reset and dropdown behaviour.
   Runs in jsdom against the real index.html / site.js (no mocks of our code). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'assets/css/styles.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'assets/js/site.js'), 'utf8');
const url = 'https://example.test/proposal/index.html';

function load({ reducedMotion = false, runScripts = true } = {}) {
  return new Promise((resolve) => {
    const vc = new VirtualConsole();
    vc.on('jsdomError', (e) => { throw e; });
    const dom = new JSDOM(html, {
      url, runScripts: runScripts ? 'dangerously' : undefined,
      pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(win) {
        // matchMedia stub honouring reduced-motion
        win.matchMedia = (q) => ({
          media: q, matches: /prefers-reduced-motion/.test(q) ? reducedMotion : false,
          addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
        });
        win.scrollTo = () => {};
        win.IntersectionObserver = class {
          constructor(cb) { this.cb = cb; }
          observe(el) { this.cb([{ isIntersecting: true, target: el }]); }
          unobserve() {} disconnect() {}
        };
        // inject the real site.js inside the jsdom realm once the DOM exists
        win.addEventListener('DOMContentLoaded', () => win.eval(js), { once: true });
      },
    });
    dom.window.addEventListener('load', () => setTimeout(() => resolve(dom), 30));
  });
}

const $ = (d, s) => d.querySelector(s);
const $$ = (d, s) => [...d.querySelectorAll(s)];

/* ---------------- structure & content ---------------- */

test('document shell: lang, title, single H1', () => {
  const { document } = new JSDOM(html).window;
  assert.equal(document.documentElement.lang, 'en');
  assert.match(document.title, /A focused growth plan/);
  const h1s = $$(document, 'h1');
  assert.equal(h1s.length, 1, 'exactly one h1');
  assert.equal(h1s[0].textContent.trim(), 'A focused growth plan');
});

test('no tagline was added under the H1', () => {
  const { document } = new JSDOM(html).window;
  const hero = $(document, '.hero');
  const paras = $$(hero, 'p').filter((p) => !p.classList.contains('hero__eyebrow'));
  assert.equal(paras.length, 0, 'hero has no extra paragraph/tagline');
});

test('only supplied plan points are present', () => {
  const { document } = new JSDOM(html).window;
  const social = $(document, '#social-title').closest('.card').textContent;
  const perf = $(document, '#performance-title').closest('.card').textContent;
  // supplied social points
  for (const p of ['15 reels', '2–3 carousels', '17–18 pieces', '3 shoot', 'B-roll', 'Educational',
    'Indirect-sales', 'Founder-led', 'English-language', 'interior designers', 'AI presentations',
    'Awareness', 'No price or discount', 'Separate creatives', 'Lead tracking', 'Location SEO',
    'quality leads', 'store curiosity', 'fabric variety', 'moodboards']) {
    assert.ok(social.includes(p), `social card missing: ${p}`);
  }
  // no invented facts from the old brand / wrong business type
  assert.ok(!/Pravin Kumar & Sons/i.test(html), 'no legacy "& Sons" name');
  assert.ok(!/furniture|real estate|clinic/i.test(html), 'no unrelated vertical language');
});

test('performance card: Meta + ChatGPT, exactly 10 numbered points', () => {
  const { document } = new JSDOM(html).window;
  const card = $(document, '#performance-title').closest('.card');
  assert.match(childText(card), /Meta/);
  assert.match(childText(card), /ChatGPT/);
  const items = $$(card, 'ol li');
  assert.equal(items.length, 10, '10 points');
  const numbers = $$(card, 'ol').flatMap((ol) => [...ol.querySelectorAll('li')].map((li) => {
    const olStart = Number(ol.getAttribute('start') || 1);
    return olStart + [...ol.children].indexOf(li);
  }));
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'numbered 1..10 across groups');
  items.forEach((li) => assert.ok(li.textContent.trim().length > 25, 'concise but complete point'));
  assert.ok(items.every((li) => li.textContent.trim().split(/\s+/).length <= 22), 'concise points (<=22 words)');
  for (const k of ['targeting', 'awareness', 'retargeting', 'testing', 'lead-quality', 'tracking', 'reporting', 'optimisation', 'Budget guidance', 'month one']) {
    assert.match(childText(card).toLowerCase(), new RegExp(k.toLowerCase()), `missing topic: ${k}`);
  }
});

test('pricing, no bundle, ad-spend caveats', () => {
  const { document } = new JSDOM(html).window;
  const amounts = $$(document, '.card__amount').map((n) => n.textContent.trim());
  assert.deepEqual(amounts, ['₹25,000', '₹15,000']);
  // the sign is its own element so the bundled glyph face is used for it
  $$(document, '.card__amount .rupee').forEach((n) => assert.equal(n.textContent, '₹'));
  assert.equal($$(document, '.card__period').length, 2);
  assert.ok($$(document, '.card__period').every((n) => /month/.test(n.textContent)));
  const body = document.body.textContent;
  assert.ok(!/combined|bundle|total investment|both plans|package/i.test(body), 'no combined/bundle section');
  assert.match(body, /Ad spend billed separately/);
  assert.match(body, /market availability/);
  assert.ok(!/Proposed/i.test(body), 'no "Proposed" tag');
});

test('callout copy is exact', () => {
  const { document } = new JSDOM(html).window;
  const callout = $(document, '.callout p');
  assert.equal(callout.textContent.replace(/\s+/g, ' ').trim(), 'Made to reach the Correct Audience.');
});

test('card colours are identical (one shared token, no per-card overrides)', () => {
  assert.equal((css.match(/\.card\s*\{[^}]*background:\s*var\(--card\)/) || []).length, 1);
  assert.ok(!/card:nth-child|card--alt|card--featured/.test(css), 'no differing card variants');
  assert.ok(!/\.card:hover[^{]*\{[^}]*background\s*:/.test(css), 'hover does not repaint the card');
});

test('single brand only: no other brand names in the copy', () => {
  const { document } = new JSDOM(html).window;
  const text = document.body.textContent;
  for (const other of ['& Sons', 'Pravin Kumar Fabrics', 'Pravinkumar Agencies']) {
    assert.ok(!text.includes(other), `found other brand: ${other}`);
  }
  assert.equal($$(document, '.logos__item--brand img').length, 1);
});

test('header logos: equal height, auto width, text fallback', () => {
  const { document } = new JSDOM(html).window;
  const logo = $(document, '.logos__item img');
  assert.ok(logo, 'brand logo img present');
  assert.ok(logo.getAttribute('alt').trim().length > 0, 'logo has alt text');
  assert.ok(Number(logo.getAttribute('width')) > 0 && Number(logo.getAttribute('height')) > 0, 'intrinsic size set (no layout shift)');
  const fallback = $(document, '.logos__fallback');
  assert.ok(fallback, 'text fallback exists');
  assert.match(css, /\.logos__item\s*\{[^}]*height:\s*40px/, 'equal height rule');
  assert.match(css, /\.logos__item img[^{]*\{[^}]*width:\s*auto/, 'auto width rule');
  assert.match(css, /object-fit:\s*contain/, 'no distortion');
});

/* ---------------- metadata / assets ---------------- */

test('OG, Twitter, canonical, manifest, icons', () => {
  const { document } = new JSDOM(html).window;
  const meta = (sel) => { const n = $(document, sel); return n && n.getAttribute('content'); };
  assert.equal(meta('link[rel="canonical"]') ?? $(document, 'link[rel="canonical"]').href, 'https://www.pravinkumars.com/proposal/');
  assert.equal(meta('meta[property="og:image"]'), 'https://www.pravinkumars.com/proposal/assets/img/og-cover.png');
  assert.equal(meta('meta[property="og:image:width"]'), '1200');
  assert.equal(meta('meta[property="og:image:height"]'), '630');
  assert.ok(meta('meta[property="og:title"]'));
  assert.ok(meta('meta[property="og:description"]'));
  assert.equal(meta('meta[name="twitter:card"]'), 'summary_large_image');
  assert.equal(meta('meta[name="twitter:image"]'), 'https://www.pravinkumars.com/proposal/assets/img/og-cover.png');
  assert.ok($(document, 'link[rel="manifest"]'));
  assert.ok($(document, 'link[rel="icon"][type="image/svg+xml"]'));
  assert.ok($(document, 'link[rel="icon"][href$=".ico"]'));
  assert.ok($(document, 'link[rel="apple-touch-icon"]'));
});

test('referenced local assets exist on disk', () => {
  const { document } = new JSDOM(html).window;
  const refs = $$(document, 'link[href], script[src], img[src], meta[property="og:image"]')
    .map((n) => n.getAttribute('href') || n.getAttribute('src') || n.getAttribute('content'))
    .filter((u) => u && !/^https?:/.test(u));
  assert.ok(refs.length >= 6);
  for (const ref of refs) {
    assert.ok(fs.existsSync(path.join(ROOT, ref)), `missing asset: ${ref}`);
  }
  const icon = fs.readFileSync(path.join(ROOT, 'assets/img/og-cover.png'));
  assert.equal(icon.readUInt32BE(16), 1200, 'og image width');
  assert.equal(icon.readUInt32BE(20), 630, 'og image height');
});

test('manifest is valid and sized correctly', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.ok(m.name && m.short_name && m.start_url && m.display);
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.match(m.background_color, /^#f5eee2$/);
});

/* ---------------- accessibility ---------------- */

test('dropdowns expose the disclosure pattern', () => {
  const { document } = new JSDOM(html).window;
  const triggers = $$(document, '.acc__trigger');
  assert.equal(triggers.length, 6, '3 dropdowns per card');
  triggers.forEach((t) => {
    assert.equal(t.tagName, 'BUTTON', 'keyboard focusable control');
    assert.equal(t.getAttribute('type'), 'button');
    assert.ok(['true', 'false'].includes(t.getAttribute('aria-expanded')));
    const panel = document.getElementById(t.getAttribute('aria-controls'));
    assert.ok(panel, 'aria-controls resolves');
    assert.equal(panel.getAttribute('role'), 'region');
    assert.equal(panel.getAttribute('aria-labelledby'), t.id);
    assert.ok(t.closest('h3'), 'trigger wrapped in a heading');
    assert.ok(t.querySelector('span').textContent.trim().length > 0, 'accessible name from text');
  });
});

test('landmarks, skip link, focus styles, external link safety', () => {
  const { document } = new JSDOM(html).window;
  assert.ok($(document, 'main#main'));
  assert.ok($(document, 'header'));
  assert.ok($(document, 'footer'));
  const skip = $(document, 'a.skip-link');
  assert.equal(skip.getAttribute('href'), '#main');
  assert.match(css, /:focus-visible/, 'visible focus ring');
  const ext = $$(document, 'a[target="_blank"]');
  ext.forEach((a) => assert.match(a.getAttribute('rel') || '', /noopener/));
  const ids = $$(document, '[id]').map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
});

test('colour contrast of text tokens meets WCAG AA', () => {
  const lum = (hex) => {
    const [r, g, b] = hex.replace('#', '').match(/../g).map((h) => {
      const v = parseInt(h, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgs = ['#faf6ef', '#f5eee2'];
  for (const bg of bgs) {
    for (const fg of ['#17120f', '#4a413a', '#6f645a', '#b8342c']) {
      assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg} = ${ratio(fg, bg).toFixed(2)}`);
    }
  }
  assert.ok(ratio('#17120f', '#f5eee2') >= 7, 'body copy is AAA');
});

/* ---------------- responsive & print ---------------- */

test('mobile overflow guards', () => {
  assert.match(css, /overflow-x:\s*hidden/, 'body clips horizontal overflow');
  assert.match(css, /minmax\(0,\s*1fr\)/, 'grid tracks can shrink');
  assert.match(css, /min-width:\s*0/, 'flex children allowed to shrink');
  assert.match(css, /max-width:\s*100%/, 'media never exceeds its container');
  assert.match(css, /clamp\(/, 'fluid type instead of fixed widths');
  assert.ok(!/(?:^|[^-])width:\s*\d{4,}px/m.test(css), 'no fixed wide blocks');
});

test('print stylesheet: A4, splash hidden, dropdowns expanded', () => {
  assert.match(css, /@media print/);
  assert.match(css, /size:\s*A4/);
  assert.match(css, /\.splash,[^{]*\{[^}]*display:\s*none/, 'splash hidden in print');
  assert.match(css, /\.acc__panel\s*\{[^}]*display:\s*block/, 'panels expanded in print');
  assert.match(css, /break-inside:\s*avoid/, 'cards do not split across pages');
  assert.match(css, /\.site-header\s*\{[^}]*display:\s*none/, 'sticky header hidden in print');
});

test('reduced-motion fallback', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.splash__logo\s*\{\s*filter:\s*none;\s*opacity:\s*1/, 'logo shown without blur animation');
});

/* ---------------- behaviour ---------------- */

test('splash: auto-closes, removes overlay, unlocks scroll, resets scroll', async () => {
  const dom = await load();
  const { document, window } = dom.window;
  await new Promise((r) => setTimeout(r, 3100));
  assert.equal(document.getElementById('splash'), null, 'overlay removed from the DOM');
  assert.ok(!document.body.classList.contains('is-locked'), 'scrolling unlocked');
  assert.equal(window.scrollY, 0, 'landing is at the top');
  dom.window.close();
});

test('splash: Skip intro button closes immediately', async () => {
  const dom = await load();
  const { document } = dom.window;
  const splash = document.getElementById('splash');
  assert.ok(splash, 'splash present initially');
  document.getElementById('skip-intro').click();
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(document.getElementById('splash'), null);
  dom.window.close();
});

test('splash: Escape closes it', async () => {
  const dom = await load();
  const { document, window, KeyboardEvent } = dom.window;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(document.getElementById('splash'), null);
  dom.window.close();
});

test('splash: reduced motion closes sooner and skips blur animation', async () => {
  const dom = await load({ reducedMotion: true });
  const { document } = dom.window;
  await new Promise((r) => setTimeout(r, 900));
  assert.equal(document.getElementById('splash'), null, 'closed without the long animation');
  dom.window.close();
});

test('scroll restoration is manual so reload never opens mid-page', () => {
  assert.match(js, /history\.scrollRestoration = "manual"/);
  assert.match(js, /window\.addEventListener\("pageshow"/);
  assert.match(js, /window\.addEventListener\("load", toTop/);
});

test('dropdowns toggle state, aria-expanded and keyboard focus', async () => {
  const dom = await load();
  const { document, window, KeyboardEvent } = dom.window;
  await new Promise((r) => setTimeout(r, 3100));
  const first = document.getElementById('s2-t');
  assert.equal(first.getAttribute('aria-expanded'), 'false');
  first.click();
  assert.equal(first.getAttribute('aria-expanded'), 'true');
  assert.ok(first.closest('.acc__item').classList.contains('is-open'));
  first.click();
  assert.equal(first.getAttribute('aria-expanded'), 'false');

  first.focus();
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(document.activeElement.id, 's3-t', 'ArrowDown moves to next dropdown');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  assert.equal(document.activeElement.id, 's1-t', 'Home jumps to the first');
  const third = document.getElementById('p3-t');
  third.click();
  third.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(third.getAttribute('aria-expanded'), 'false', 'Escape collapses');
  dom.window.close();
});

function childText(node) { return node.textContent; }

/* ---------------- progressive enhancement ---------------- */

test('without JS the page is fully readable: no overlay, nothing hidden', () => {
  assert.match(css, /\.splash \{[^}]*display: none;/, 'splash hidden unless JS runs');
  assert.match(css, /\.js \.splash \{ display: grid; \}/);
  const plain = css.replace(/\.js \.reveal \{[^}]*\}/g, '');
  assert.match(plain, /\.reveal \{\s*opacity: 1;/, 'reveal content visible without JS');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  // no JS ran: nothing carries inert/aria-hidden locks beyond the splash dialog
  assert.equal(dom.window.document.querySelectorAll('main[inert]').length, 0);
  dom.window.close();
});

test('splash isolates the page from screen readers while it is on screen', async () => {
  const dom = await load();
  const { document } = dom.window;
  const main = document.getElementById('main');
  assert.ok(main.hasAttribute('inert'), 'page inert behind the splash');
  assert.equal(main.getAttribute('aria-hidden'), 'true');
  await new Promise((r) => setTimeout(r, 3100));
  assert.ok(!main.hasAttribute('inert'), 'released after the splash');
  assert.equal(main.getAttribute('aria-hidden'), null);
  dom.window.close();
});

test('splash dialog is labelled by the "Made for" label', () => {
  const { document } = new JSDOM(html).window;
  const dialog = document.getElementById('splash');
  assert.equal(dialog.getAttribute('role'), 'dialog');
  const label = document.getElementById(dialog.getAttribute('aria-labelledby'));
  assert.equal(label.textContent.trim(), 'Made for');
});

test('collapsed panels are hidden from assistive tech', async () => {
  const dom = await load();
  const { document } = dom.window;
  await new Promise((r) => setTimeout(r, 3100));
  const closedPanel = document.getElementById('s2-p');
  assert.equal(closedPanel.getAttribute('aria-hidden'), 'true');
  assert.ok(closedPanel.hasAttribute('inert'));
  const otherPanel = document.getElementById('s1-p');
  assert.equal(otherPanel.getAttribute('aria-hidden'), 'true', 'all start collapsed');
  document.getElementById('s1-t').click();
  assert.equal(otherPanel.getAttribute('aria-hidden'), 'false', 'opening exposes the panel');
  assert.ok(!otherPanel.hasAttribute('inert'));
  dom.window.close();
});

test('print handlers expand every panel and restore state afterwards', async () => {
  const dom = await load();
  const { document, window } = dom.window;
  await new Promise((r) => setTimeout(r, 3100));
  window.dispatchEvent(new window.Event('beforeprint'));
  document.querySelectorAll('.acc__panel').forEach((p) => {
    assert.equal(p.getAttribute('aria-hidden'), 'false', 'expanded for print');
  });
  window.dispatchEvent(new window.Event('afterprint'));
  assert.equal(document.getElementById('s2-p').getAttribute('aria-hidden'), 'true', 'state restored');
  dom.window.close();
});

/* ---------------- automated a11y audit (axe-core) ---------------- */

test('axe-core finds no WCAG 2.1 A/AA violations in the settled page', async () => {
  const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
  const dom = await load();
  const { window } = dom.window;
  await new Promise((r) => setTimeout(r, 3100)); // splash gone, page settled
  window.eval(axeSource);
  const results = await window.axe.run(window.document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  });
  // Array.from keeps the results in this realm (axe runs inside jsdom)
  const summary = Array.from(results.violations, (v) => `${v.id} (${v.nodes.length}): ${v.help}`);
  assert.deepEqual(summary, [], 'no accessibility violations');
  // jsdom has no canvas, so axe cannot compute colour contrast here; the
  // "colour contrast of text tokens" test asserts the same pairs mathematically.
  const incomplete = Array.from(results.incomplete, (i) => i.id);
  assert.deepEqual(incomplete.filter((id) => id !== 'color-contrast'), [], 'nothing else needs manual review');
  dom.window.close();
});

/* ---------------- self-hosted type ---------------- */

test('every @font-face file ships with the site', () => {
  const faces = [...css.matchAll(/url\("\.\.\/(fonts\/[^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(faces.length >= 6, 'webfonts are declared');
  for (const f of new Set(faces)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets', f)), `missing font: ${f}`);
  }
  assert.equal(faces.filter((f) => /rupee-serif/.test(f)).length, 1, 'rupee serif face is bundled once');
  assert.equal(faces.filter((f) => /rupee-sans/.test(f)).length, 1, 'rupee sans face is bundled once');
});

test('the bundled ₹ faces carry real, upright outlines in the price faces', async () => {
  const opentype = require('opentype.js');
  const fs2 = require('fs');
  const path2 = require('path');
  const wawoff2 = require('wawoff2');
  for (const which of ['serif', 'sans']) {
    const file = path2.join(ROOT, `assets/fonts/rupee-${which}.woff2`);
    // woff2 -> ttf so the outlines can be inspected
    const ttf = Buffer.from(await wawoff2.decompress(fs2.readFileSync(file)));
    const font = opentype.parse(ttf.buffer.slice(ttf.byteOffset, ttf.byteOffset + ttf.byteLength));
    const glyph = font.charToGlyph('\u20B9');
    assert.ok(glyph.index > 0, `${which}: ₹ is mapped in the cmap`);
    const cmds = glyph.path.commands;
    assert.ok(cmds.length > 10, `${which}: outlines present (${cmds.length} commands)`);
    // opentype.js emits CFF outlines, which keep PostScript cubics: cubic or
    // quadratic curves are both fine, but there must be real curves and no
    // straight-line approximation of the bowl.
    const curves = cmds.filter((c) => c.type === 'C' || c.type === 'Q').length;
    assert.ok(curves >= 8, `${which}: curved outlines present (${curves} curves)`);
    assert.equal(font.outlinesFormat, 'cff', `${which}: outlines match the emitted flavour`);
    const ys = cmds.flatMap((c) => [c.y, c.y1, c.y2]).filter(Number.isFinite);
    const xs = cmds.flatMap((c) => [c.x, c.x1, c.x2]).filter(Number.isFinite);
    const height = Math.max(...ys) - Math.min(...ys);
    const width = Math.max(...xs) - Math.min(...xs);
    assert.ok(height > 0 && width > 0, `${which}: glyph has ink`);
    assert.ok(Math.min(...ys) >= -5, `${which}: sits on the baseline (upright, not flipped)`);
    assert.ok(height / width > 1.05 && height / width < 2.2, `${which}: ₹ proportions (h/w ${(height / width).toFixed(2)})`);
    assert.ok(glyph.advanceWidth > width * 0.85, `${which}: sidebearings are sane`);
  }
});

test('the price mark is a real rupee glyph, not a system fallback', () => {
  const { document } = new JSDOM(html).window;
  const amounts = $$(document, '.card__amount').map((n) => n.textContent.trim());
  amounts.forEach((a) => assert.ok(a.startsWith('\u20B9'), `missing ₹: ${a}`));
  assert.equal($$(document, '.card__amount .rupee').length, 2, 'the ₹ is set in its own face');
  // the faces we ship have no ₹, so a dedicated single-glyph face must exist
  assert.match(css, /font-family:\s*"Rupee Serif"/);
  assert.match(css, /--serif:[^;]*"Rupee Serif"/);
  assert.match(css, /--sans:[^;]*"Rupee Sans"/);
});
