const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const pageLookup = {};   // filled in after the pages are read

function list(block) {
  const lines = block.split('\n').filter((l) => l.trim());
  let html = '';
  const stack = [];
  for (const line of lines) {
    const m = line.match(/^(\s*)[-*] (.*)$/);
    if (!m) continue;
    const indent = m[1].replace(/\t/g, '    ').length;
    if (stack.length === 0 || indent > stack[stack.length - 1]) {
      html += '<ul><li>';
      stack.push(indent);
    } else {
      while (stack.length > 1 && indent < stack[stack.length - 1]) {
        html += '</li></ul>';
        stack.pop();
      }
      html += '</li><li>';
    }
    html += inline(m[2]);
  }
  while (stack.length) {
    html += '</li></ul>';
    stack.pop();
  }
  return html;
}

function markdown(md) {
  return md
    .split(/\n{2,}/)
    .map((block) => {
      block = block.trim();
      if (!block) return '';
      const h = block.match(/^(#{1,4})\s+(.*)$/);
      if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      if (/^[-*] /.test(block)) return list(block);
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
  const rel = path.relative('content', path.dirname(f));
  const folder = rel ? rel.split(path.sep)[0] : '';
  const { title, body, locked } = parse(fs.readFileSync(f, 'utf8'), slug);
  return { slug, title, body, locked, folder };
});
const scramble = (s) => s.replace(/[\p{L}\p{N}]/gu, rune);

pages.forEach((p) => {
  p.shownTitle = p.locked ? scramble(p.title) : p.title;
  p.outSlug = p.locked
    ? 'sealed-' + crypto.createHash('sha1').update(p.slug).digest('hex').slice(0, 8)
    : p.slug;
  pageLookup[p.slug] = p;
});

function readFolderInfo(folder) {
  const file = path.join('content', folder, '_folder.json');
  let info = {};
  if (fs.existsSync(file)) {
    try { info = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (e) { throw new Error(`Problem in ${file}: ${e.message}`); }
  }
  return {
    label: info.label || folder.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    order: info.order || [],
    position: info.position ?? 100,
  };
}

const folderNames = [...new Set(pages.map((p) => p.folder).filter(Boolean))];
const groups = folderNames
  .map((name) => ({ name, ...readFolderInfo(name) }))
  .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label));

function sortPages(list, order) {
  return list.sort((a, b) => {
    const ia = order.indexOf(a.slug), ib = order.indexOf(b.slug);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? Infinity : ia) - (ib === -1 ? Infinity : ib);
    return (a.locked - b.locked) || a.title.localeCompare(b.title, undefined, { numeric: true });
  });
}

const link = (p) => `<a href="/${p.outSlug}/">${p.shownTitle}</a>`;

function buildNav(current) {
  const dropdowns = groups.map((g) => {
    const members = sortPages(pages.filter((p) => p.folder === g.name), g.order);
    const open = members.some((p) => p.slug === current) ? ' open' : '';
    return `<details${open}><summary>${g.label}</summary>${members.map(link).join('')}</details>`;
  }).join('');

  const loose = sortPages(pages.filter((p) => !p.folder && p.slug !== 'index'), [])
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