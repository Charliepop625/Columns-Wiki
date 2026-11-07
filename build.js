const fs = require('fs');
const path = require('path');

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

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
    .replace(/\[\[(.+?)\]\]/g, (_, name) => `<a href="/${slugify(name)}/">${name}</a>`)
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function parse(raw, fallbackTitle) {
  let title = fallbackTitle;
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (m) {
    const t = m[1].match(/^title:\s*(.*)$/m);
    if (t) title = t[1];
    raw = raw.slice(m[0].length);
  }
  return { title, body: raw };
}

const files = fs.readdirSync('content').filter((f) => f.endsWith('.md'));
const pages = files.map((f) => {
  const slug = f.replace(/\.md$/, '');
  const { title, body } = parse(fs.readFileSync(path.join('content', f), 'utf8'), slug);
  return { slug, title, body };
});

const nav = '<a href="/">Home</a>' +
  pages.filter((p) => p.slug !== 'index')
       .sort((a, b) => a.title.localeCompare(b.title))
       .map((p) => `<a href="/${p.slug}/">${p.title}</a>`).join('');

const template = fs.readFileSync('template.html', 'utf8');

fs.rmSync('dist', { recursive: true, force: true });
for (const p of pages) {
  const outDir = p.slug === 'index' ? 'dist' : path.join('dist', p.slug);
  fs.mkdirSync(outDir, { recursive: true });
  const html = template
    .replace(/{{title}}/g, p.title)
    .replace('{{nav}}', nav)
    .replace('{{content}}', markdown(p.body));
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}
fs.copyFileSync('style.css', 'dist/style.css');
console.log(`Built ${pages.length} pages`);