// =========================================================
// api.js - Saare pages ke common functions
// (backend se baat, login session, markdown, dates, subjects)
// =========================================================

const API_BASE = '/api';
const TOKEN_KEY = 'studymate_token';
const USER_KEY = 'studymate_user';

// ---------- Login session ----------
function getToken() { return localStorage.getItem(TOKEN_KEY); }

function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); }
  catch { return null; }
}

function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function requireLogin() {
  if (!getToken()) { location.replace('index.html'); return false; }
  return true;
}

function redirectIfLoggedIn() {
  if (getToken()) location.replace('dashboard.html');
}

// Server se latest user info (role, language) laake save karna
async function refreshUser() {
  try {
    const { user } = await api('/auth/me');
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  } catch {
    return getUser();
  }
}

const isAdmin = () => (getUser() || {}).role === 'admin';

// Voice input / read aloud ke liye browser language code
function speechLang() {
  return (getUser() || {}).answerLanguage === 'hindi' ? 'hi-IN' : 'en-IN';
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function logout() {
  clearSession();
  location.href = 'index.html';
}

// ---------- Backend API call ----------
async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  let res;
  try {
    res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach the server. Check that "node server.js" is running.');
  }

  let data = {};
  try { data = await res.json(); } catch { /* JSON nahi tha */ }

  if (res.status === 401 && token) {
    clearSession();
    location.replace('index.html');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Subjects ek hi baar load karke yaad rakhna
let subjectsCache = null;
async function getSubjects() {
  if (!subjectsCache) subjectsCache = (await api('/subjects')).subjects;
  return subjectsCache;
}

// ---------- Subject ka short tag aur color ----------
const SUBJECT_META = {
  'General': { tag: 'GEN', color: '#19E3CF' },
  'DBMS': { tag: 'SQL', color: '#F5B84B' },
  'Java': { tag: 'JV', color: '#FF7A59' },
  'Python': { tag: 'PY', color: '#4FA3FF' },
  'C Programming': { tag: 'C', color: '#9FB0D6' },
  'Data Structures': { tag: 'DS', color: '#B48CFF' },
  'Operating Systems': { tag: 'OS', color: '#3DDC84' },
  'Computer Networks': { tag: 'NET', color: '#2FD0F0' },
  'Web Development': { tag: 'WEB', color: '#FF5DA2' },
  'Mathematics': { tag: 'MTH', color: '#FFD84D' },
};

function subjectMeta(name) {
  return SUBJECT_META[name] || { tag: String(name || '?').slice(0, 3).toUpperCase(), color: '#7C5CFF' };
}

function subjectTag(name) {
  const m = subjectMeta(name);
  return `<span class="tag" style="--c:${m.color}">${escapeHtml(m.tag)}</span>`;
}

// ---------- Helpers ----------
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function formatDate(value) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
}

function relativeTime(value) {
  const diff = (Date.now() - new Date(value).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'yesterday';
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function localDayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Markdown (AI ke answers) ----------
// Code blocks ko VS Code jaisa header (language + copy button) milta hai.
// DOMPurify har HTML ko saaf karta hai taaki XSS attack na ho sake.
let markedReady = false;
function setupMarked() {
  if (markedReady || !window.marked) return;
  markedReady = true;
  marked.use({
    gfm: true,
    breaks: true,
    renderer: {
      code(code, lang) {
        const language = (lang || '').trim().split(/\s+/)[0] || 'code';
        return `<div class="code-block"><div class="code-head"><span>${escapeHtml(language)}</span>
          <button type="button" class="code-copy" data-copy-code>${icon('copy', 14)}<span>Copy</span></button></div>
          <pre><code>${escapeHtml(code)}</code></pre></div>`;
      },
    },
  });
}

function renderMarkdown(text) {
  setupMarked();
  if (window.marked && window.DOMPurify) {
    return DOMPurify.sanitize(marked.parse(String(text)));
  }
  return escapeHtml(text).replace(/\n/g, '<br>');
}

// Ek line ka markdown (quiz options mein `code` ke liye)
function renderInline(text) {
  setupMarked();
  if (window.marked && window.DOMPurify) return DOMPurify.sanitize(marked.parseInline(String(text)));
  return escapeHtml(text);
}

// Markdown hata ke simple text (read aloud aur search ke liye)
function plainText(md) {
  return String(md)
    .replace(/```[\s\S]*?```/g, ' code example. ')
    .replace(/[#>*_`|~-]+/g, ' ')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// Code block ka copy button (har page par kaam kare)
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-copy-code]');
  if (!btn) return;
  const code = btn.closest('.code-block').querySelector('code').textContent;
  const ok = await copyText(code);
  btn.querySelector('span').textContent = ok ? 'Copied' : 'Failed';
  setTimeout(() => { btn.querySelector('span').textContent = 'Copy'; }, 1400);
});

// ---------- Toast message ----------
function showToast(message, type = 'info') {
  let wrap = document.querySelector('.toasts');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toasts';
    wrap.setAttribute('role', 'status');
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `${icon(type === 'error' ? 'alert' : 'check', 16)}<span>${escapeHtml(message)}</span>`;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 250); }, 2400);
}
