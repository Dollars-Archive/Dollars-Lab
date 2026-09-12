const REPO = 'Dollars-Archive/Dollars-Lab';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main/`;
const BLOB_BASE = `https://github.com/${REPO}/blob/main/`;

function slugify(text) {
  return text.toLowerCase().trim().replace(/[`*_~]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'section';
}

function projectFileFromHref(href) {
  if (/^https?:\/\//.test(href)) {
    try {
      const url = new URL(href);
      return url.searchParams.get('file') || '';
    } catch { return ''; }
  }
  return href;
}

function parseProjects(markdown) {
  const start = markdown.indexOf('## Projects');
  if (start < 0) return [];
  const tail = markdown.slice(start + '## Projects'.length);
  const end = tail.search(/\n##\s+/);
  const section = end >= 0 ? tail.slice(0, end) : tail;
  const rows = section.split('\n').filter((line) => /^\|/.test(line.trim()));
  return rows.slice(2).map((line) => {
    const cells = line.split('|').slice(1, -1).map((v) => v.trim());
    if (cells.length < 4) return null;
    const match = cells[0].match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!match) return null;
    const file = projectFileFromHref(match[2]);
    if (!/^projects\/[A-Za-z0-9._\/-]+\.md$/.test(file) || file.includes('..')) return null;
    return { title: match[1], file, platform: cells[1], description: cells[2], status: cells[3] };
  }).filter(Boolean);
}

async function loadIndex() {
  const status = document.getElementById('status');
  const grid = document.getElementById('project-grid');
  try {
    const response = await fetch(`${RAW_BASE}README.md?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const projects = parseProjects(await response.text());
    if (!projects.length) throw new Error('No projects found');
    grid.innerHTML = projects.map((p) => `
      <a class="project-card" href="project.html?file=${encodeURIComponent(p.file)}">
        <div class="card-meta"><span class="pill">${p.platform}</span><span class="card-status">${p.status}</span></div>
        <h3>${p.title}</h3>
        <p>${p.description}</p>
      </a>`).join('');
    status.hidden = true;
    grid.hidden = false;
  } catch (error) {
    console.error(error);
    status.innerHTML = `프로젝트 목록을 불러오지 못했습니다.<br><a href="https://github.com/${REPO}" target="_blank" rel="noreferrer">GitHub에서 보기 ↗</a>`;
  }
}

function decorateCallouts(root) {
  const labels = { IMPORTANT: '중요', TIP: '팁', WARNING: '주의', CAUTION: '경고', NOTE: '참고' };
  root.querySelectorAll('blockquote').forEach((block) => {
    const first = block.querySelector('p');
    if (!first) return;
    const match = first.textContent.trim().match(/^\[!(IMPORTANT|TIP|WARNING|CAUTION|NOTE)\]/i);
    if (!match) return;
    const type = match[1].toUpperCase();
    block.classList.add('callout', type.toLowerCase());
    first.innerHTML = first.innerHTML.replace(/^\[!(IMPORTANT|TIP|WARNING|CAUTION|NOTE)\]\s*/i, '');
    const label = document.createElement('div');
    label.className = 'callout-label';
    label.textContent = labels[type] || type;
    block.prepend(label);
    if (!first.textContent.trim()) first.remove();
  });
}

function buildToc(root) {
  const toc = document.getElementById('toc');
  const used = new Map();
  const headings = [...root.querySelectorAll('h2, h3')];
  toc.innerHTML = '';
  headings.forEach((heading) => {
    let id = slugify(heading.textContent);
    const count = (used.get(id) || 0) + 1;
    used.set(id, count);
    if (count > 1) id = `${id}-${count}`;
    heading.id = id;
    const a = document.createElement('a');
    a.href = `#${id}`;
    a.textContent = heading.textContent;
    if (heading.tagName === 'H3') a.classList.add('sub');
    toc.appendChild(a);
  });
}

function addCopyButtons(root) {
  root.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;
    const button = document.createElement('button');
    button.className = 'copy-btn';
    button.type = 'button';
    button.textContent = '복사';
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        button.textContent = '완료';
        setTimeout(() => button.textContent = '복사', 1200);
      } catch { button.textContent = '실패'; }
    });
    pre.appendChild(button);
  });
}

function resolveRelativeAssets(root, file) {
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  root.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (!src || /^(https?:|data:)/.test(src)) return;
    img.src = RAW_BASE + dir + src.replace(/^\.\//, '');
  });
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || /^(https?:|mailto:)/.test(href)) return;
    const target = dir + href.replace(/^\.\//, '');
    if (/^projects\/.*\.md(?:#.*)?$/i.test(target)) {
      const [path, hash] = target.split('#');
      a.href = `project.html?file=${encodeURIComponent(path)}${hash ? `#${hash}` : ''}`;
    } else {
      a.href = BLOB_BASE + target;
      a.target = '_blank';
      a.rel = 'noreferrer';
    }
  });
  root.querySelectorAll('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noreferrer'; });
}

async function loadReader() {
  const params = new URLSearchParams(location.search);
  const file = params.get('file') || '';
  const status = document.getElementById('status');
  const reader = document.getElementById('reader');
  const title = document.getElementById('page-title');
  const pathEl = document.getElementById('page-path');
  const rawLink = document.getElementById('raw-link');

  if (!/^projects\/[A-Za-z0-9._\/-]+\.md$/.test(file) || file.includes('..')) {
    status.textContent = '허용되지 않은 문서 경로입니다.';
    return;
  }

  pathEl.textContent = file;
  rawLink.href = BLOB_BASE + file;

  try {
    const response = await fetch(`${RAW_BASE}${file}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    const titleMatch = markdown.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      title.textContent = titleMatch[1].trim();
      document.title = `${titleMatch[1].trim()} · Dollars Lab`;
    }
    if (!window.marked) throw new Error('Markdown renderer unavailable');
    marked.setOptions({ gfm: true, breaks: false, mangle: false, headerIds: false });
    reader.innerHTML = marked.parse(markdown);
    decorateCallouts(reader);
    resolveRelativeAssets(reader, file);
    addCopyButtons(reader);
    buildToc(reader);
    status.hidden = true;
    reader.hidden = false;
  } catch (error) {
    console.error(error);
    status.innerHTML = `문서를 불러오지 못했습니다.<br><a href="${BLOB_BASE}${file}" target="_blank" rel="noreferrer">GitHub 원문에서 보기 ↗</a>`;
  }
}

if (document.body.dataset.page === 'index') loadIndex();
if (document.body.dataset.page === 'reader') loadReader();
