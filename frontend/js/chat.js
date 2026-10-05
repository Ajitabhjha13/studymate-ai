// =========================================================
// chat.js - Main AI chat page
// =========================================================

const SUGGESTIONS = {
  'General': ['How should I plan revision for semester exams?', 'Explain the difference between RAM and ROM', 'What is an algorithm? Give a real-life example', 'How does the internet work, in simple words?'],
  'DBMS': ['Explain normalization: 1NF, 2NF and 3NF', 'Primary key vs foreign key', 'Explain ACID properties with an example', 'Write an SQL query using JOIN with an example'],
  'Java': ['Explain the four pillars of OOP in Java', 'Abstract class vs interface', 'Method overloading vs overriding', 'How does exception handling work in Java?'],
  'Python': ['List vs tuple vs set', 'Explain decorators in simple words', 'How does exception handling work in Python?', 'Write a program to reverse a string'],
  'C Programming': ['Explain pointers with a simple example', 'Call by value vs call by reference', 'What is a structure in C?', 'malloc vs calloc'],
  'Data Structures': ['Stack vs queue with real-life examples', 'Explain binary search step by step', 'What is Big O notation?', 'How does a linked list work?'],
  'Operating Systems': ['What is deadlock? Explain its four conditions', 'Paging vs segmentation', 'Process vs thread', 'Explain CPU scheduling algorithms'],
  'Computer Networks': ['Explain the 7 layers of the OSI model', 'TCP vs UDP', 'How does DNS work?', 'What is an IP address and subnet mask?'],
  'Web Development': ['How does a browser display a web page?', 'GET vs POST', 'What is a REST API?', 'Explain the CSS box model'],
  'Mathematics': ['Explain matrix multiplication step by step', 'Permutation vs combination with examples', 'Find the derivative of x² sin x', 'What is a probability distribution?'],
};

const params = new URLSearchParams(location.search);
let subjectId = params.get('subject') || '1';
let subjects = [];
let sending = false;
let stickToBottom = true;

const el = {
  thread: document.getElementById('thread'),
  messages: document.getElementById('messages'),
  title: document.getElementById('subjectTitle'),
  headTag: document.getElementById('headTag'),
  form: document.getElementById('composer'),
  input: document.getElementById('input'),
  select: document.getElementById('subjectSelect'),
  tagSlot: document.getElementById('subjectTagSlot'),
  sendBtn: document.getElementById('sendBtn'),
  counter: document.getElementById('counter'),
  mic: document.getElementById('micBtn'),
  jump: document.getElementById('jumpBtn'),
};

if (requireLogin()) {
  mountShell('chat');
  init();
}

async function init() {
  try {
    subjects = await getSubjects();
  } catch (err) {
    el.thread.innerHTML = errorHtml(err.message);
    return;
  }
  if (!subjects.some((s) => String(s.id) === subjectId)) subjectId = String(subjects[0].id);

  el.select.innerHTML = subjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  renderSidebarSubjects();
  attachVoice(el.mic, el.input, syncInput);

  await openSubject(subjectId);

  const q = params.get('q');
  if (q) {
    history.replaceState(null, '', `chat.html?subject=${subjectId}`);
    el.input.value = q;
    syncInput();
    sendQuestion();
  } else {
    el.input.focus();
  }
}

const nameOf = (id) => (subjects.find((s) => String(s.id) === String(id)) || { name: 'General' }).name;

// ---------- Sidebar ke andar subject list ----------
function renderSidebarSubjects() {
  const box = document.getElementById('sbSection');
  box.innerHTML = `<div class="sb-label">Subjects <span class="mono">${subjects.length}</span></div>
    <ul class="sb-subjects">${subjects.map((s) => `
      <li><button class="sb-subject" type="button" data-id="${s.id}" aria-pressed="${String(s.id) === subjectId}">
        ${subjectTag(s.name)}<span>${escapeHtml(s.name)}</span></button></li>`).join('')}
    </ul>`;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('.sb-subject');
    if (b) { document.body.classList.remove('sb-open'); openSubject(b.dataset.id); }
  });
}

el.select.addEventListener('change', () => openSubject(el.select.value));

// ---------- Subject kholna aur uski purani chat load karna ----------
async function openSubject(id) {
  if (sending) { showToast('Wait for the current answer to finish.', 'error'); el.select.value = subjectId; return; }
  subjectId = String(id);
  const name = nameOf(id);

  el.title.textContent = name;
  el.headTag.innerHTML = subjectTag(name);
  el.tagSlot.innerHTML = subjectTag(name);
  el.select.value = subjectId;
  el.input.placeholder = `Ask anything about ${name}…`;
  document.title = `${name} · StudyMate AI`;
  document.querySelectorAll('.sb-subject').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === subjectId)));
  history.replaceState(null, '', `chat.html?subject=${subjectId}`);

  el.thread.innerHTML = thinkingHtml('Loading conversation…');

  try {
    const { history: rows } = await api(`/history?subjectId=${subjectId}`);
    if (subjectId !== String(id)) return;
    el.thread.innerHTML = '';
    if (rows.length === 0) {
      showEmpty(name);
    } else {
      rows.slice(0, 30).reverse().forEach((r) => {
        addUser(r.question);
        addAnswer({ text: r.answer, meta: relativeTime(r.created_at), question: r.question });
      });
      scrollToBottom(false);
    }
  } catch (err) {
    el.thread.innerHTML = errorHtml(err.message);
  }
}

// ---------- Empty state ----------
function showEmpty(name) {
  const list = SUGGESTIONS[name] || SUGGESTIONS.General;
  const heading = name === 'General' ? 'What do you want to learn today?' : `How can I help with ${escapeHtml(name)} today?`;
  el.thread.innerHTML = `
    <div class="chat-empty" id="emptyState">
      <div class="orb orb-lg"><span></span></div>
      <h2>${heading}</h2>
      <p>Pick a starter or type your own question below. Answers are saved to your history.</p>
      <div class="starter-grid">
        ${list.map((s, i) => `<button class="starter-card" type="button" data-q="${escapeHtml(s)}">
          <small>${icon(['sparkles', 'book', 'bolt', 'terminal'][i % 4], 13)} ${['Explain', 'Compare', 'Quick answer', 'Practice'][i % 4]}</small>
          ${escapeHtml(s)}</button>`).join('')}
      </div>
    </div>`;
}

// ---------- Message templates ----------
function addUser(text) {
  const div = document.createElement('div');
  div.className = 'msg-user';
  div.innerHTML = `<div class="bubble"></div>`;
  div.firstChild.textContent = text;
  el.thread.appendChild(div);
}

function addAnswer({ text, meta = '', question = '', stream = false }) {
  const art = document.createElement('article');
  art.className = 'msg-ai';
  art.innerHTML = `
    <div class="ai-avatar">${logoSvg(32)}</div>
    <div class="ai-body">
      <div class="ai-name">StudyMate <span class="mono">${escapeHtml(meta)}</span></div>
      <div class="prose"></div>
      <div class="ai-actions" ${stream ? 'hidden' : ''}>
        <button class="act" type="button" data-act="copy">${icon('copy', 14)}<span>Copy</span></button>
        <button class="act" type="button" data-act="speak">${icon('volume', 14)}<span>Listen</span></button>
        <button class="act" type="button" data-act="again">${icon('refresh', 14)}<span>Regenerate</span></button>
      </div>
    </div>`;
  art.dataset.raw = text;
  art.dataset.question = question;
  el.thread.appendChild(art);

  const prose = art.querySelector('.prose');
  if (stream) {
    streamInto(prose, text, () => { art.querySelector('.ai-actions').hidden = false; });
  } else {
    prose.innerHTML = renderMarkdown(text);
  }
  return art;
}

// Answer ko dheere-dheere type hote hue dikhana (ChatGPT jaisa feel)
function streamInto(target, text, done) {
  if (prefersReducedMotion() || text.length < 60) {
    target.innerHTML = renderMarkdown(text);
    done();
    keepScrolled();
    return;
  }
  const step = Math.max(4, Math.ceil(text.length / 110));
  let i = 0;
  const frame = () => {
    i = Math.min(text.length, i + step);
    target.innerHTML = renderMarkdown(text.slice(0, i)) + (i < text.length ? '<span class="stream-caret"></span>' : '');
    keepScrolled();
    if (i < text.length) requestAnimationFrame(frame);
    else done();
  };
  requestAnimationFrame(frame);
}

function thinkingHtml(label) {
  return `<div class="msg-ai" id="thinking">
    <div class="ai-avatar busy">${logoSvg(32)}</div>
    <div class="ai-body"><div class="ai-name"><span class="shimmer-text">${label}</span></div>
    <div class="skeleton"><i></i><i></i><i></i></div></div></div>`;
}

function errorHtml(message, question) {
  return `<div class="msg-error">${icon('alert', 18)}<span>${escapeHtml(message)}</span>
    ${question ? `<button class="btn btn-ghost btn-sm" type="button" data-retry="${escapeHtml(question)}">${icon('refresh', 14)}Try again</button>` : ''}</div>`;
}

// ---------- Clicks inside the conversation ----------
el.thread.addEventListener('click', async (e) => {
  const starter = e.target.closest('.starter-card');
  if (starter) { el.input.value = starter.dataset.q; syncInput(); sendQuestion(); return; }

  const retry = e.target.closest('[data-retry]');
  if (retry) {
    const q = retry.dataset.retry;
    retry.closest('.msg-error').remove();
    el.input.value = q; syncInput(); sendQuestion(true);
    return;
  }

  const act = e.target.closest('[data-act]');
  if (!act) return;
  const art = act.closest('.msg-ai');
  if (act.dataset.act === 'copy') {
    const ok = await copyText(art.dataset.raw);
    act.innerHTML = `${icon(ok ? 'check' : 'x', 14)}<span>${ok ? 'Copied' : 'Failed'}</span>`;
    setTimeout(() => { act.innerHTML = `${icon('copy', 14)}<span>Copy</span>`; }, 1500);
  }
  if (act.dataset.act === 'speak') toggleSpeak(act, art.dataset.raw);
  if (act.dataset.act === 'again') {
    if (!art.dataset.question) return;
    el.input.value = art.dataset.question; syncInput(); sendQuestion();
  }
});

// ---------- Sawaal bhejna ----------
async function sendQuestion(skipBubble = false) {
  const question = el.input.value.trim();
  if (!question || sending) return;

  sending = true;
  syncInput();
  const askedIn = subjectId;
  const started = performance.now();

  const empty = document.getElementById('emptyState');
  if (empty) empty.remove();

  if (!skipBubble) addUser(question);
  el.input.value = '';
  syncInput();
  el.thread.insertAdjacentHTML('beforeend', thinkingHtml('Thinking…'));
  stickToBottom = true;
  scrollToBottom();

  const slowTimer = setTimeout(() => {
    const t = document.querySelector('#thinking .shimmer-text');
    if (t) t.textContent = 'Model is busy, retrying with a backup model…';
  }, 6000);

  try {
    const data = await api('/ask', { method: 'POST', body: { question, subjectId: Number(askedIn) } });
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    removeThinking();
    if (subjectId === askedIn) {
      addAnswer({ text: data.answer, meta: `${data.model || 'gemini'} · ${secs}s`, question, stream: true });
    } else {
      showToast(`Answer saved in ${nameOf(askedIn)}`);
    }
  } catch (err) {
    removeThinking();
    if (subjectId === askedIn) {
      el.thread.insertAdjacentHTML('beforeend', errorHtml(err.message, question));
      scrollToBottom();
    }
  } finally {
    clearTimeout(slowTimer);
    sending = false;
    syncInput();
    el.input.focus();
  }
}

function removeThinking() {
  const t = document.getElementById('thinking');
  if (t) t.remove();
}

// ---------- Composer ----------
function syncInput() {
  const len = el.input.value.length;
  el.counter.textContent = `${len} / 2000`;
  el.counter.classList.toggle('warn', len > 1800);
  el.sendBtn.disabled = sending || el.input.value.trim().length === 0;
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 220) + 'px';
}

el.input.addEventListener('input', syncInput);
el.form.addEventListener('submit', (e) => { e.preventDefault(); sendQuestion(); });
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(); }
});

// ---------- Scrolling ----------
function scrollToBottom(smooth = true) {
  el.messages.scrollTo({ top: el.messages.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

function keepScrolled() {
  if (stickToBottom) el.messages.scrollTop = el.messages.scrollHeight;
}

el.messages.addEventListener('scroll', () => {
  const gap = el.messages.scrollHeight - el.messages.scrollTop - el.messages.clientHeight;
  stickToBottom = gap < 120;
  el.jump.hidden = gap < 300;
});
el.jump.addEventListener('click', () => { stickToBottom = true; scrollToBottom(); });
