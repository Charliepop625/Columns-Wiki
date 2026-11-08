const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const pageLookup = {};   // filled in after the pages are read

function markdown(md) {
  return md
    .split(/\n{2,}/)
    .map((block) => {
      block = block.trim();
      if (!block) return '';
      const h = block.match(/^(#{1,4})\s+(.*)$/);
      if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      if (/^[-*] /.test(block)) {
        const items = block.split('\n').map((l) => `<li>${inline(l.replace(/^[-*] /, ''))}</li>`);
        return `<ul>${items.join('')}</ul>`;
      }
      return `<p>${inline(block)}</p>`;
    })
    .join('\n');
}

function inline(s) {
  return s
    .replace(/\[\[(.+?)\]\]/g, (_, name) => {
      const target = pageLookup[slugify(name)];
      return target
        ? `<a href="/${target.outSlug}/">${target.shownTitle}</a>`
        : `<a href="/${slugify(name)}/">${name}</a>`;
    })
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
const rune = () => RUNES[Math.floor(Math.random() * RUNES.length)];

// Keeps the page's shape but swaps every letter and digit for a random rune
function sealed(html) {
  const noLinks = html.replace(/<a [^>]*>|<\/a>/g, '');
  const scrambled = noLinks.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) =>
    tag ? tag : text.replace(/[A-Za-z0-9]/g, rune));
  return `<div class="cipher">${scrambled}</div>`;
}

function parse(raw, fallbackTitle) {
  let title = fallbackTitle, locked = false;
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    const t = m[1].match(/^title:\s*(.*)$/m);
    if (t) title = t[1];
    locked = /^locked:\s*true\s*$/m.test(m[1]);
    raw = raw.slice(m[0].length);
  }
  return { title, body: raw, locked };
}

function findMarkdown(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return findMarkdown(full);
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

const files = findMarkdown('content');
const pages = files.map((f) => {
  const slug = path.basename(f, '.md');
  const { title, body, locked } = parse(fs.readFileSync(f, 'utf8'), slug);
  return { slug, title, body, locked };
});
const scramble = (s) => s.replace(/[\p{L}\p{N}]/gu, rune);

pages.forEach((p) => {
  p.shownTitle = p.locked ? scramble(p.title) : p.title;
  p.outSlug = p.locked
    ? 'sealed-' + crypto.createHash('sha1').update(p.slug).digest('hex').slice(0, 8)
    : p.slug;
  pageLookup[p.slug] = p;
});

// Each dropdown: a label, plus the page file names (without .md) inside it, in order.
const groups = [
  { label: 'Residents',  slugs: ['isador', 'dion', 'corinthia', 'all-residents'] },
  { label: 'Locations',  slugs: ['main-hall'] },
  { label: 'History',    slugs: ['chapter1', 'chapter2', 'chapter3', 'chapter4', 'chapter5', 'chapter6', 'chapter7', 'chapter8', 'chapter9'] },
  { label: 'Entities',   slugs: ['the-light'] },
];

const grouped = new Set(groups.flatMap((g) => g.slugs));
const bySlug = Object.fromEntries(pages.map((p) => [p.slug, p]));
const link = (p) => `<a href="/${p.outSlug}/">${p.shownTitle}</a>`;

function buildNav(current) {
  const dropdowns = groups.map((g) => {
    const existing = g.slugs.filter((s) => pageLookup[s]);
    if (existing.length === 0) return '';
    const items = existing.map((s) => link(pageLookup[s])).join('');
    const open = g.slugs.includes(current) ? ' open' : '';
    return `<details${open}><summary>${g.label}</summary>${items}</details>`;
  }).join('');

  const loose = pages
    .filter((p) => p.slug !== 'index' && !grouped.has(p.slug))
    .sort((a, b) => (a.locked - b.locked) || a.title.localeCompare(b.title))
    .map(link).join('');

  return '<a href="/">Home</a>' + dropdowns + loose;
}

const template = fs.readFileSync('template.html', 'utf8');

fs.rmSync('dist', { recursive: true, force: true });
for (const p of pages) {
  const outDir = p.slug === 'index' ? 'dist' : path.join('dist', p.outSlug);
  fs.mkdirSync(outDir, { recursive: true });
  const html = template
    .replace(/{{title}}/g, p.shownTitle)
    .replace('{{nav}}', buildNav(p.slug))
    .replace('{{content}}', p.locked ? sealed(markdown(p.body)) : markdown(p.body));
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}
fs.copyFileSync('style.css', 'dist/style.css');
console.log(`Built ${pages.length} pages`);