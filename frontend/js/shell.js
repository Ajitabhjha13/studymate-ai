// =========================================================
// shell.js - Sidebar, mobile menu, Ctrl+K command palette,
//            aur keyboard shortcuts (saare logged-in pages)
// =========================================================

function navLink(href, iconName, label, active) {
  return `<a class="sb-link" href="${href}" ${active ? 'aria-current="page"' : ''}>${icon(iconName)}<span>${label}</span></a>`;
}

function navHtml(active) {
  return `
      ${navLink('dashboard.html', 'home', 'Home', active === 'home')}
      ${navLink('chat.html', 'chat', 'Ask AI', active === 'chat')}
      ${navLink('docs.html', 'file', 'My Notes', active === 'docs')}
      ${navLink('quiz.html', 'target', 'Quiz', active === 'quiz')}
      ${navLink('history.html', 'history', 'History', active === 'history')}
      ${isAdmin() ? navLink('admin.html', 'shield', 'Admin', active === 'admin') : ''}`;
}

function mountShell(active) {
  hydrateIcons();
  const user = getUser() || { name: 'Student', email: '' };

  document.getElementById('sidebar').innerHTML = `
    <div class="sb-top">
      ${brandHtml()}
      <button class="icon-btn sb-close" type="button" data-sb-close aria-label="Close menu">${icon('x')}</button>
    </div>
    <a class="new-btn" href="chat.html">${icon('plus')}<span>New question</span></a>
    <button class="search-trigger" type="button" data-open-palette>
      ${icon('search', 16)}<span>Search…</span><kbd>Ctrl K</kbd>
    </button>
    <nav class="sb-nav" aria-label="Main" id="sbNav">${navHtml(active)}</nav>
    <div class="sb-section" id="sbSection"></div>
    <div class="sb-user ${active === 'settings' ? 'is-active' : ''}">
      <a class="sb-user-link" href="settings.html" title="Profile & settings">
        <span class="avatar">${escapeHtml(initials(user.name))}</span>
        <span class="sb-user-info">
          <strong>${escapeHtml(user.name)}</strong>
          <small>${user.role === 'admin' ? 'Admin · ' : ''}${escapeHtml(user.email || '')}</small>
        </span>
      </a>
      <a class="icon-btn" href="settings.html" title="Settings" aria-label="Settings">${icon('settings')}</a>
      <button class="icon-btn" type="button" data-logout title="Log out" aria-label="Log out">${icon('logout')}</button>
    </div>`;

  document.getElementById('mobileBar').innerHTML = `
    <button class="icon-btn" type="button" data-sb-open aria-label="Open menu">${icon('menu', 20)}</button>
    ${brandHtml()}
    <button class="icon-btn" type="button" data-open-palette aria-label="Search">${icon('search', 20)}</button>`;

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-sb-open]')) document.body.classList.add('sb-open');
    if (e.target.closest('[data-sb-close]')) document.body.classList.remove('sb-open');
    if (e.target.closest('[data-logout]')) logout();
    if (e.target.closest('[data-open-palette]')) openPalette();
  });

  setupShortcuts();

  // Role ya naam server par badla ho to sidebar update karo (jaise admin bana diya gaya)
  const before = JSON.stringify(user);
  refreshUser().then((fresh) => {
    if (fresh && JSON.stringify(fresh) !== before) {
      document.getElementById('sbNav').innerHTML = navHtml(active);
      const info = document.querySelector('.sb-user-info');
      if (info) info.innerHTML = `<strong>${escapeHtml(fresh.name)}</strong><small>${fresh.role === 'admin' ? 'Admin · ' : ''}${escapeHtml(fresh.email)}</small>`;
    }
  });
}

// ---------- Keyboard shortcuts ----------
function isTyping(el) {
  return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      paletteOpen ? closePalette() : openPalette();
      return;
    }
    if (e.key === '/' && !isTyping(document.activeElement) && !paletteOpen) {
      const input = document.querySelector('[data-primary-input]');
      if (input) { e.preventDefault(); input.focus(); }
    }
    if (e.key === 'Escape') {
      if (paletteOpen) closePalette();
      document.body.classList.remove('sb-open');
    }
  });
}

// ---------- Command palette (Ctrl + K) ----------
let paletteOpen = false;
let paletteItems = [];
let paletteActive = 0;

async function buildPaletteItems() {
  const items = [
    { group: 'Go to', label: 'Home', hint: 'Dashboard', icon: 'home', href: 'dashboard.html' },
    { group: 'Go to', label: 'Ask AI', hint: 'Chat', icon: 'chat', href: 'chat.html' },
    { group: 'Go to', label: 'My Notes', hint: 'Chat with your PDFs', icon: 'file', href: 'docs.html' },
    { group: 'Go to', label: 'Quiz', hint: 'Test yourself', icon: 'target', href: 'quiz.html' },
    { group: 'Go to', label: 'History', hint: 'Saved answers', icon: 'history', href: 'history.html' },
  ];
  try {
    const subjects = await getSubjects();
    subjects.forEach((s) => items.push({
      group: 'Open subject', label: s.name, subject: s.name, href: `chat.html?subject=${s.id}`,
    }));
  } catch { /* subjects na mile to bhi palette chale */ }
  items.push({ group: 'Go to', label: 'Settings', hint: 'Profile, language, password', icon: 'settings', href: 'settings.html' });
  if (isAdmin()) items.push({ group: 'Go to', label: 'Admin panel', hint: 'Users and usage', icon: 'shield', href: 'admin.html' });
  items.push({ group: 'Actions', label: 'Upload a PDF', icon: 'upload', href: 'docs.html?upload=1' });
  items.push({ group: 'Actions', label: 'Export history as Markdown', icon: 'download', href: 'history.html?export=1' });
  items.push({ group: 'Actions', label: 'Log out', icon: 'logout', run: logout });
  return items;
}

async function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true;
  document.body.classList.remove('sb-open');

  const wrap = document.createElement('div');
  wrap.className = 'palette-backdrop';
  wrap.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
      <div class="palette-input">${icon('search', 18)}
        <input type="text" placeholder="Type a page, subject or action…" aria-label="Search commands" autocomplete="off">
        <kbd>Esc</kbd>
      </div>
      <div class="palette-list" role="listbox"></div>
      <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
    </div>`;
  document.body.appendChild(wrap);

  const input = wrap.querySelector('input');
  const list = wrap.querySelector('.palette-list');
  input.focus();

  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closePalette(); });

  paletteItems = await buildPaletteItems();
  if (!paletteOpen) return;

  let filtered = paletteItems;
  const render = () => {
    const q = input.value.trim().toLowerCase();
    filtered = paletteItems.filter((it) => !q || it.label.toLowerCase().includes(q) || it.group.toLowerCase().includes(q));
    paletteActive = Math.min(paletteActive, Math.max(filtered.length - 1, 0));
    if (filtered.length === 0) {
      list.innerHTML = '<p class="palette-empty">No match. Try "history" or a subject name.</p>';
      return;
    }
    let lastGroup = '';
    list.innerHTML = filtered.map((it, i) => {
      const head = it.group !== lastGroup ? `<div class="palette-group">${it.group}</div>` : '';
      lastGroup = it.group;
      const lead = it.subject ? subjectTag(it.subject) : `<span class="palette-icon">${icon(it.icon, 16)}</span>`;
      return `${head}<button type="button" class="palette-item ${i === paletteActive ? 'active' : ''}" data-i="${i}" role="option">
        ${lead}<span>${escapeHtml(it.label)}</span>${it.hint ? `<small>${it.hint}</small>` : ''}</button>`;
    }).join('');
    const activeEl = list.querySelector('.palette-item.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  };

  const run = (it) => {
    if (!it) return;
    closePalette();
    if (it.run) it.run(); else location.href = it.href;
  };

  input.addEventListener('input', () => { paletteActive = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); paletteActive = (paletteActive + 1) % filtered.length; render(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); paletteActive = (paletteActive - 1 + filtered.length) % filtered.length; render(); }
    if (e.key === 'Enter') { e.preventDefault(); run(filtered[paletteActive]); }
  });
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.palette-item');
    if (btn) run(filtered[Number(btn.dataset.i)]);
  });
  list.addEventListener('mousemove', (e) => {
    const btn = e.target.closest('.palette-item');
    if (btn && Number(btn.dataset.i) !== paletteActive) { paletteActive = Number(btn.dataset.i); render(); }
  });

  render();
}

function closePalette() {
  paletteOpen = false;
  const wrap = document.querySelector('.palette-backdrop');
  if (wrap) wrap.remove();
}
