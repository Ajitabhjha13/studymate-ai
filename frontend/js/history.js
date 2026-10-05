// =========================================================
// history.js - Saare purane sawaal-jawab: search, filter,
//              date-wise groups, delete, Markdown export
// =========================================================

let allChats = [];
let subjects = [];
let activeSubject = '';

const resultsEl = document.getElementById('results');
const searchEl = document.getElementById('search');
const chipsEl = document.getElementById('chips');
const countEl = document.getElementById('histCount');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');

if (requireLogin()) {
  mountShell('history');
  init();
}

async function init() {
  try {
    const [subs, { history }] = await Promise.all([getSubjects(), api('/history')]);
    subjects = subs;
    allChats = history;
    renderChips();
    render();
    if (new URLSearchParams(location.search).get('export') && allChats.length) exportMarkdown();
  } catch (err) {
    resultsEl.innerHTML = `<div class="empty-state"><h3>Could not load history</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function renderChips() {
  const used = new Set(allChats.map((c) => String(c.subject_id)));
  const list = subjects.filter((s) => used.has(String(s.id)));
  chipsEl.innerHTML = `<button class="chip" type="button" data-id="" aria-pressed="${activeSubject === ''}">All <span class="mono">${allChats.length}</span></button>` +
    list.map((s) => {
      const n = allChats.filter((c) => String(c.subject_id) === String(s.id)).length;
      return `<button class="chip" type="button" data-id="${s.id}" aria-pressed="${activeSubject === String(s.id)}" style="--c:${subjectMeta(s.name).color}">
        <i></i>${escapeHtml(s.name)} <span class="mono">${n}</span></button>`;
    }).join('');
}

chipsEl.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  activeSubject = chip.dataset.id;
  renderChips();
  render();
});
searchEl.addEventListener('input', render);

// Date ke hisaab se group: Today, Yesterday, Previous 7 days, Older
function groupOf(date) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((today - d) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  if (days < 30) return 'Previous 30 days';
  return 'Older';
}

function highlight(text, q) {
  const safe = escapeHtml(text);
  if (!q) return safe;
  const pattern = new RegExp(`(${escapeHtml(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return safe.replace(pattern, '<mark>$1</mark>');
}

function render() {
  const q = searchEl.value.trim();
  const ql = q.toLowerCase();
  countEl.textContent = `${allChats.length} saved question${allChats.length === 1 ? '' : 's'}`;
  exportBtn.hidden = clearBtn.hidden = allChats.length === 0;

  if (allChats.length === 0) {
    chipsEl.hidden = true;
    resultsEl.innerHTML = `<div class="empty-state">
      <div class="orb"><span></span></div>
      <h3>No questions yet</h3>
      <p>Everything you ask StudyMate is saved here, grouped by date and searchable.</p>
      <a class="btn btn-primary" href="chat.html">${icon('plus', 16)}Ask your first question</a></div>`;
    return;
  }
  chipsEl.hidden = false;

  const shown = allChats.filter((c) =>
    (!activeSubject || String(c.subject_id) === activeSubject) &&
    (!ql || c.question.toLowerCase().includes(ql) || c.answer.toLowerCase().includes(ql)));

  if (shown.length === 0) {
    resultsEl.innerHTML = `<div class="empty-state"><h3>No matches</h3><p>Nothing found for "${escapeHtml(q)}". Try another word or pick "All".</p></div>`;
    return;
  }

  const groups = [];
  shown.forEach((c) => {
    const g = groupOf(c.created_at);
    let bucket = groups.find((x) => x.name === g);
    if (!bucket) { bucket = { name: g, items: [] }; groups.push(bucket); }
    bucket.items.push(c);
  });

  resultsEl.innerHTML = groups.map((g) => `
    <section class="h-group">
      <div class="h-group-title">${g.name} <span>${g.items.length}</span></div>
      <div class="h-list">${g.items.map((c) => itemHtml(c, q)).join('')}</div>
    </section>`).join('');
}

function itemHtml(c, q) {
  return `<details class="h-item" data-id="${c.id}">
    <summary>
      ${subjectTag(c.subject)}
      <span class="h-q">${highlight(c.question, q)}</span>
      <span class="h-time" title="${formatDate(c.created_at)}">${relativeTime(c.created_at)}</span>
      ${icon('chevronRight', 16)}
    </summary>
    <div class="h-body">
      <div class="prose" data-md></div>
      <div class="h-actions">
        <button class="act" type="button" data-act="copy">${icon('copy', 14)}<span>Copy answer</span></button>
        <button class="act" type="button" data-act="speak">${icon('volume', 14)}<span>Listen</span></button>
        <a class="act" href="chat.html?subject=${c.subject_id || 1}">${icon('chat', 14)}<span>Continue in chat</span></a>
        <button class="act danger" type="button" data-act="delete">${icon('trash', 14)}<span>Delete</span></button>
      </div>
    </div>
  </details>`;
}

// Answer tabhi render karo jab item khule (fast page)
resultsEl.addEventListener('toggle', (e) => {
  const item = e.target;
  if (!item.open) return;
  const box = item.querySelector('[data-md]');
  if (box && !box.dataset.done) {
    const chat = allChats.find((c) => String(c.id) === item.dataset.id);
    box.innerHTML = renderMarkdown(chat.answer);
    box.dataset.done = '1';
  }
}, true);

resultsEl.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]');
  if (!act) return;
  const item = act.closest('.h-item');
  const chat = allChats.find((c) => String(c.id) === item.dataset.id);

  if (act.dataset.act === 'copy') {
    const ok = await copyText(chat.answer);
    showToast(ok ? 'Answer copied' : 'Copy failed', ok ? 'info' : 'error');
  }
  if (act.dataset.act === 'speak') toggleSpeak(act, chat.answer);
  if (act.dataset.act === 'delete') {
    if (!confirm('Delete this question and its answer?')) return;
    try {
      await api(`/history/${chat.id}`, { method: 'DELETE' });
      allChats = allChats.filter((c) => c.id !== chat.id);
      renderChips();
      render();
      showToast('Question deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }
});

clearBtn.addEventListener('click', async () => {
  if (!confirm('Delete your entire history? This cannot be undone.')) return;
  try {
    await api('/history', { method: 'DELETE' });
    allChats = [];
    activeSubject = '';
    renderChips();
    render();
    showToast('History cleared');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ---------- Export as Markdown file ----------
function exportMarkdown() {
  const user = getUser();
  const lines = [
    '# StudyMate AI: Question History',
    '',
    `Student: ${user ? user.name : ''}  `,
    `Exported: ${new Date().toLocaleString('en-IN')}  `,
    `Total questions: ${allChats.length}`,
    '',
  ];
  allChats.forEach((c, i) => {
    lines.push('---', '', `## ${i + 1}. ${c.question}`, '', `*${c.subject} · ${formatDate(c.created_at)}*`, '', c.answer, '');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `studymate-history-${localDayKey(new Date())}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast('History exported');
}
exportBtn.addEventListener('click', exportMarkdown);
