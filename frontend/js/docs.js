// =========================================================
// docs.js - My Notes: PDF upload aur PDF se sawaal-jawab
// =========================================================

const MAX_MB = 10;
const DOC_STARTERS = [
  { icon: 'book', label: 'Summary', q: 'Summarize this document in simple points.' },
  { icon: 'bolt', label: 'Key points', q: 'List the 10 most important points for exams from this PDF.' },
  { icon: 'target', label: 'Exam prep', q: 'Make 5 likely exam questions from this PDF with short answers.' },
  { icon: 'sparkles', label: 'Simplify', q: 'Explain the hardest concept in this PDF in very simple words with an example.' },
];

let docs = [];
let activeId = null;
let sending = false;

const el = {
  items: document.getElementById('docItems'),
  dropzone: document.getElementById('dropzone'),
  file: document.getElementById('fileInput'),
  thread: document.getElementById('thread'),
  messages: document.getElementById('messages'),
  title: document.getElementById('docTitle'),
  meta: document.getElementById('docMeta'),
  open: document.getElementById('openPdf'),
  chip: document.getElementById('docChip'),
  form: document.getElementById('composer'),
  input: document.getElementById('input'),
  send: document.getElementById('sendBtn'),
};

if (requireLogin()) {
  mountShell('docs');
  attachVoice(document.getElementById('micBtn'), el.input, syncInput);
  init();
}

async function init() {
  try {
    docs = (await api('/docs')).documents;
  } catch (err) {
    el.items.innerHTML = `<li class="empty-note">${escapeHtml(err.message)}</li>`;
    return;
  }
  renderList();
  const params = new URLSearchParams(location.search);
  const want = Number(params.get('id'));
  if (params.get('upload')) el.dropzone.focus();
  if (docs.length) selectDoc(docs.some((d) => d.id === want) ? want : docs[0].id, false);
  else showNoDocs();
}

// ---------- List ----------
function renderList() {
  if (!docs.length) {
    el.items.innerHTML = '<li class="empty-note">No PDFs yet. Upload your class notes, a syllabus or a chapter.</li>';
    return;
  }
  el.items.innerHTML = docs.map((d) => `
    <li><div class="doc-item" data-id="${d.id}" aria-current="${d.id === activeId}" role="button" tabindex="0">
      <span class="doc-icon">${icon('file', 18)}</span>
      <span class="doc-body"><strong>${escapeHtml(d.name)}</strong>
        <small>${formatBytes(d.size)} · ${d.questions} question${d.questions === 1 ? '' : 's'} · ${relativeTime(d.createdAt)}</small></span>
      <button class="icon-btn doc-del" type="button" data-del="${d.id}" aria-label="Delete ${escapeHtml(d.name)}">${icon('trash', 15)}</button>
    </div></li>`).join('');
}

el.items.addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); deleteDoc(Number(del.dataset.del)); return; }
  const item = e.target.closest('.doc-item');
  if (item) selectDoc(Number(item.dataset.id));
});
el.items.addEventListener('keydown', (e) => {
  const item = e.target.closest('.doc-item');
  if (item && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectDoc(Number(item.dataset.id)); }
});

document.getElementById('docBack').addEventListener('click', () => document.body.classList.remove('doc-open'));

// ---------- Upload ----------
el.file.addEventListener('change', () => { if (el.file.files[0]) uploadFile(el.file.files[0]); el.file.value = ''; });
el.dropzone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.file.click(); } });
['dragenter', 'dragover'].forEach((t) => el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((t) => el.dropzone.addEventListener(t, (e) => { e.preventDefault(); el.dropzone.classList.remove('is-over'); }));
el.dropzone.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) uploadFile(f); });

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadFile(file) {
  if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
    showToast('Only PDF files are supported.', 'error');
    return;
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    showToast(`PDF must be ${MAX_MB} MB or smaller.`, 'error');
    return;
  }

  el.dropzone.classList.add('is-busy');
  el.dropzone.querySelector('strong').textContent = `Uploading ${file.name}…`;
  try {
    const data = await readAsBase64(file);
    const { document: doc } = await api('/docs', { method: 'POST', body: { name: file.name, data } });
    docs.unshift(doc);
    renderList();
    selectDoc(doc.id);
    showToast('PDF uploaded');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    el.dropzone.classList.remove('is-busy');
    el.dropzone.querySelector('strong').textContent = 'Upload a PDF';
  }
}

async function deleteDoc(id) {
  const d = docs.find((x) => x.id === id);
  if (!d || !confirm(`Delete "${d.name}" and its conversation?`)) return;
  try {
    await api(`/docs/${id}`, { method: 'DELETE' });
    docs = docs.filter((x) => x.id !== id);
    renderList();
    if (activeId === id) {
      activeId = null;
      if (docs.length) selectDoc(docs[0].id, false); else showNoDocs();
    }
    showToast('PDF deleted');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------- Open PDF in new tab ----------
el.open.addEventListener('click', async () => {
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(`/api/docs/${activeId}/file`, { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!res.ok) throw new Error('Could not open the PDF.');
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location = url; else window.open(url, '_blank');
  } catch (err) {
    if (tab) tab.close();
    showToast(err.message, 'error');
  }
});

// ---------- Select a document ----------
function showNoDocs() {
  activeId = null;
  el.title.textContent = 'Your notes';
  el.meta.textContent = '';
  el.open.hidden = true;
  el.chip.innerHTML = '';
  el.input.disabled = true;
  el.input.placeholder = 'Upload a PDF to start…';
  el.thread.innerHTML = `
    <div class="chat-empty">
      <div class="orb orb-lg"><span></span></div>
      <h2>Chat with your own notes</h2>
      <p>Upload class notes, a syllabus or a textbook chapter as a PDF. StudyMate reads it and answers from it, with page references where it can.</p>
      <button class="btn btn-primary" type="button" id="bigUpload" style="margin-top:22px">${icon('upload', 16)}Upload a PDF</button>
    </div>`;
  document.getElementById('bigUpload').onclick = () => el.file.click();
  syncInput();
}

async function selectDoc(id, openOnMobile = true) {
  if (sending) { showToast('Wait for the current answer to finish.', 'error'); return; }
  activeId = id;
  const d = docs.find((x) => x.id === id);
  renderList();
  if (openOnMobile) document.body.classList.add('doc-open');

  el.title.textContent = d.name;
  el.meta.textContent = formatBytes(d.size);
  el.open.hidden = false;
  el.chip.innerHTML = `${icon('file', 13)}<span>${escapeHtml(d.name)}</span>`;
  el.input.disabled = false;
  el.input.placeholder = 'Ask anything from this PDF…';
  history.replaceState(null, '', `docs.html?id=${id}`);
  el.thread.innerHTML = '<p class="muted" style="text-align:center">Loading…</p>';

  try {
    const { chats } = await api(`/docs/${id}/chats`);
    if (activeId !== id) return;
    el.thread.innerHTML = '';
    if (!chats.length) showStarters(d);
    else {
      chats.forEach((c) => { addUser(c.question); addAnswer(c.answer, relativeTime(c.created_at)); });
      el.messages.scrollTop = el.messages.scrollHeight;
    }
  } catch (err) {
    el.thread.innerHTML = `<div class="msg-error">${icon('alert', 18)}<span>${escapeHtml(err.message)}</span></div>`;
  }
  syncInput();
}

function showStarters(d) {
  el.thread.innerHTML = `
    <div class="chat-empty" id="emptyState">
      <div class="doc-hero">${icon('file', 30)}</div>
      <h2>${escapeHtml(d.name)}</h2>
      <p>Ready. Ask anything from this PDF, or start with one of these.</p>
      <div class="starter-grid">
        ${DOC_STARTERS.map((s) => `<button class="starter-card" type="button" data-q="${escapeHtml(s.q)}">
          <small>${icon(s.icon, 13)} ${s.label}</small>${escapeHtml(s.q)}</button>`).join('')}
      </div>
    </div>`;
}

// ---------- Messages ----------
function addUser(text) {
  const div = document.createElement('div');
  div.className = 'msg-user';
  div.innerHTML = '<div class="bubble"></div>';
  div.firstChild.textContent = text;
  el.thread.appendChild(div);
}

function addAnswer(text, meta, stream = false) {
  const art = document.createElement('article');
  art.className = 'msg-ai';
  art.innerHTML = `<div class="ai-avatar">${logoSvg(32)}</div>
    <div class="ai-body">
      <div class="ai-name">StudyMate <span class="mono">${escapeHtml(meta || '')}</span></div>
      <div class="prose"></div>
      <div class="ai-actions">
        <button class="act" type="button" data-act="copy">${icon('copy', 14)}<span>Copy</span></button>
        <button class="act" type="button" data-act="speak">${icon('volume', 14)}<span>Listen</span></button>
      </div>
    </div>`;
  art.dataset.raw = text;
  el.thread.appendChild(art);
  const prose = art.querySelector('.prose');
  if (!stream || prefersReducedMotion()) { prose.innerHTML = renderMarkdown(text); return; }
  const step = Math.max(4, Math.ceil(text.length / 110));
  let i = 0;
  const frame = () => {
    i = Math.min(text.length, i + step);
    prose.innerHTML = renderMarkdown(text.slice(0, i)) + (i < text.length ? '<span class="stream-caret"></span>' : '');
    el.messages.scrollTop = el.messages.scrollHeight;
    if (i < text.length) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

el.thread.addEventListener('click', async (e) => {
  const starter = e.target.closest('.starter-card');
  if (starter) { el.input.value = starter.dataset.q; syncInput(); ask(); return; }
  const act = e.target.closest('[data-act]');
  if (!act) return;
  const raw = act.closest('.msg-ai').dataset.raw;
  if (act.dataset.act === 'copy') {
    const okCopy = await copyText(raw);
    act.querySelector('span').textContent = okCopy ? 'Copied' : 'Failed';
    setTimeout(() => { act.querySelector('span').textContent = 'Copy'; }, 1400);
  }
  if (act.dataset.act === 'speak') toggleSpeak(act, raw);
});

// ---------- Ask ----------
async function ask() {
  const question = el.input.value.trim();
  if (!question || sending || !activeId) return;
  sending = true;
  const docId = activeId;
  const started = performance.now();
  const empty = document.getElementById('emptyState');
  if (empty) empty.remove();

  addUser(question);
  el.input.value = '';
  syncInput();
  el.thread.insertAdjacentHTML('beforeend', `<div class="msg-ai" id="thinking"><div class="ai-avatar busy">${logoSvg(32)}</div>
    <div class="ai-body"><div class="ai-name"><span class="shimmer-text">Reading your PDF…</span></div>
    <div class="skeleton"><i></i><i></i><i></i></div></div></div>`);
  el.messages.scrollTop = el.messages.scrollHeight;

  try {
    const data = await api(`/docs/${docId}/ask`, { method: 'POST', body: { question } });
    document.getElementById('thinking')?.remove();
    const d = docs.find((x) => x.id === docId);
    if (d) { d.questions++; renderList(); }
    if (activeId === docId) addAnswer(data.answer, `${data.model || 'gemini'} · ${((performance.now() - started) / 1000).toFixed(1)}s`, true);
  } catch (err) {
    document.getElementById('thinking')?.remove();
    if (activeId === docId) el.thread.insertAdjacentHTML('beforeend', `<div class="msg-error">${icon('alert', 18)}<span>${escapeHtml(err.message)}</span></div>`);
  } finally {
    sending = false;
    syncInput();
    el.input.focus();
  }
}

function syncInput() {
  el.send.disabled = sending || !activeId || !el.input.value.trim();
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 200) + 'px';
}
el.input.addEventListener('input', syncInput);
el.form.addEventListener('submit', (e) => { e.preventDefault(); ask(); });
el.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } });
