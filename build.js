const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const pageLookup = {};   // filled in after the pages are read

// List menu on sidebar
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

function table(block) {
  const lines = block.split('\n');
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
  const head = cells(lines[0]).map((c) => `<th>${c}</th>`).join('');
  const rows = lines.slice(2)
    .map((l) => `<tr>${cells(l).map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function markdown(md) {
  md = md.replace(/\r\n/g, '\n');
  const codes = [];
  md = md.replace(/^```[^\n]*\n([\s\S]*?)\n```[ \t]*$/gm, (_, code) => {
    codes.push(code);
    return `\n\n@@CODE${codes.length - 1}@@\n\n`;
  });
  return md
    .split(/\n{2,}/)
    .map((block) => {
      block = block.trim();
      if (!block) return '';
      if (/^(-{3,}|\*{3,})$/.test(block)) return '<hr>';
      const rowsOfBlock = block.split('\n');
      if (rowsOfBlock.length > 2 && /^\|.*\|$/.test(rowsOfBlock[0].trim()) && /^\|?\s*:?-{3,}/.test(rowsOfBlock[1].trim())) {
        return table(block);
      }
      const c = block.match(/^@@CODE(\d+)@@$/);
      if (c) return `<pre><code>${escapeHtml(codes[c[1]])}</code></pre>`;
      const fig = block.match(/^!\[(.*?)\]\((.+?)\)(\{left\})?$/);
      if (fig) {
        const side = fig[3] ? 'left' : 'right';
        const caption = fig[1] ? `<figcaption>${fig[1]}</figcaption>` : '';
        return `<figure class="portrait ${side}"><img src="${fig[2]}" alt="${fig[1]}">${caption}</figure>`;
      }
      const q = block.match(/^(>+)/);
      if (q) {
        const level = Math.min(q[1].length, 4);
        const text = block.split('\n').map((l) => l.replace(/^>+\s?/, '')).join(' ');
        return `<p class="indent indent-${level}">${inline(text)}</p>`;
      }
      const h = block.match(/^(#{1,4})\s+(.*)$/);
      if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      if (/^[-*] /.test(block)) return list(block);
      return `<p>${inline(block).replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');
}

function inline(s) {
  return s
    .replace(/\[\[(.+?)\]\]/g, (_, inner) => {
      const [name, custom] = inner.split('|').map((x) => x.trim());
      const target = pageLookup[slugify(name)];
      if (!target) return `<a href="/${slugify(name)}/">${custom || name}</a>`;
      const text = target.locked ? target.shownTitle : (custom || target.shownTitle);
      return `<a href="/${target.outSlug}/">${text}</a>`;
    })
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
const rune = () => RUNES[Math.floor(Math.random() * RUNES.length)];

// Keeps the page's shape but swaps every letter and digit for a random rune
function sealed(html) {
  const noLinks = html
    .replace(/<figure[\s\S]*?<\/figure>/g, '')
    .replace(/<a [^>]*>|<\/a>/g, '');
  const scrambled = noLinks.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) =>
    tag ? tag : text.replace(/[A-Za-z0-9]/g, rune));
  return `<div class="cipher">${scrambled}</div>`;
}

function sealedBlock(html) {
  const clean = html
    .replace(/<figure[\s\S]*?<\/figure>/g, '')
    .replace(/<a [^>]*>|<\/a>/g, '');
  const out = clean.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) =>
    tag ? tag : text.replace(/[A-Za-z0-9]/g, rune));
  return `<div class="cipher block">${out}</div>`;
}

// Turns a page body into HTML, scrambling any :::locked blocks
function render(body) {
  const parts = body
    .replace(/\r\n/g, '\n')
    .split(/^:::locked[ \t]*\n([\s\S]*?)\n:::[ \t]*$/m);
  return parts
    .map((part, i) => (i % 2 ? sealedBlock(markdown(part)) : markdown(part)))
    .join('\n');
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
    .replace('{{content}}', p.locked ? sealed(render(p.body)) : render(p.body));
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}
fs.copyFileSync('style.css', 'dist/style.css');
if (fs.existsSync('content/images')) fs.cpSync('content/images', 'dist/images', { recursive: true });
console.log(`Built ${pages.length} pages`);