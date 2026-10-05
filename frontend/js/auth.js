// =========================================================
// auth.js - Login / Register page + terminal demo animation
// =========================================================

redirectIfLoggedIn();
hydrateIcons();

const form = document.querySelector('[data-auth-form]');
const mode = form.dataset.authForm; // "login" ya "register"
const errorBox = form.querySelector('.form-error');
const submitBtn = form.querySelector('button[type="submit"]');

function showError(message) {
  errorBox.innerHTML = `${icon('alert', 16)}<span>${escapeHtml(message)}</span>`;
  errorBox.hidden = false;
}

// ---------- Password dikhana / chhupana ----------
document.querySelectorAll('[data-reveal]').forEach((btn) => {
  const input = document.getElementById(btn.dataset.reveal);
  const paint = () => {
    const shown = input.type === 'text';
    btn.innerHTML = icon(shown ? 'eyeOff' : 'eye', 17);
    btn.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
  };
  btn.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    paint();
    input.focus();
  });
  paint();
});

// ---------- Password strength meter (sirf register) ----------
const strength = document.getElementById('strength');
if (strength) {
  const label = document.getElementById('strengthLabel');
  const names = ['', 'Weak', 'Okay', 'Good', 'Strong'];
  document.getElementById('password').addEventListener('input', (e) => {
    const p = e.target.value;
    let score = 0;
    if (p.length >= 6) score++;
    if (p.length >= 8) score++;
    if (/\d/.test(p) && /[a-zA-Z]/.test(p)) score++;
    if (/[^a-zA-Z0-9]/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) score++;
    if (p.length < 6) score = p.length ? 1 : 0;
    strength.dataset.level = score;
    label.textContent = p ? `Strength: ${names[score]}` : 'Use 8+ characters with a number for a strong password';
  });
}

// ---------- Form submit ----------
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const payload = Object.fromEntries(new FormData(form).entries());

  if (mode === 'register') {
    if (!payload.name.trim()) return showError('Please enter your name.');
    if (payload.password.length < 6) return showError('Password must be at least 6 characters.');
    if (payload.password !== payload.confirm) return showError('Passwords do not match.');
  }
  if (!payload.email.trim() || !payload.password) return showError('Please enter your email and password.');
  delete payload.confirm;

  const original = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = mode === 'login' ? 'Logging in…' : 'Creating account…';

  try {
    const data = await api(`/auth/${mode}`, { method: 'POST', body: payload });
    saveSession(data.token, data.user);
    location.href = 'dashboard.html';
  } catch (err) {
    showError(err.message);
    submitBtn.disabled = false;
    submitBtn.textContent = original;
  }
});

// ---------- Terminal demo (left side) ----------
const DEMOS = [
  {
    subject: 'dbms',
    question: 'What is normalization?',
    time: '1.4s',
    answer: '<b>Normalization</b> organises tables so the same data is not stored twice. A large table is split into smaller related tables, which prevents update mistakes and saves space.',
  },
  {
    subject: 'os',
    question: 'What causes a deadlock?',
    time: '1.1s',
    answer: 'A <b>deadlock</b> happens when processes wait on each other forever. It needs four conditions together: mutual exclusion, hold and wait, no preemption and circular wait.',
  },
  {
    subject: 'python',
    question: 'list vs tuple?',
    time: '0.9s',
    answer: 'A <b>list</b> can be changed after creation, a <b>tuple</b> cannot. Tuples are slightly faster and can be used as dictionary keys, so use them for fixed data.',
  },
];

const term = document.getElementById('termBody');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function commandHtml(demo, typed) {
  return `<span class="t-prompt">~/studymate $</span> ask <span class="t-flag">--subject</span> ${demo.subject} <span class="t-str">"${escapeHtml(typed)}"</span>`;
}

async function playTerminal() {
  if (!term) return;
  if (prefersReducedMotion()) {
    const d = DEMOS[0];
    term.innerHTML = `<div class="term-line">${commandHtml(d, d.question)}</div>
      <div class="term-line t-ok">✓ answer ready in ${d.time}</div>
      <div class="t-answer show">${d.answer}</div>`;
    return;
  }

  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  while (true) {
    const d = DEMOS[i % DEMOS.length];
    term.innerHTML = '<div class="term-line" id="tCmd"></div><div class="term-line" id="tStatus"></div><div class="t-answer" id="tAnswer"></div>';
    const cmd = document.getElementById('tCmd');
    const status = document.getElementById('tStatus');
    const answer = document.getElementById('tAnswer');

    for (let c = 0; c <= d.question.length; c++) {
      cmd.innerHTML = commandHtml(d, d.question.slice(0, c)) + '<span class="caret"></span>';
      await sleep(42);
    }
    cmd.innerHTML = commandHtml(d, d.question);
    await sleep(250);

    for (let s = 0; s < 14; s++) {
      status.innerHTML = `<span class="t-flag">${spinner[s % spinner.length]}</span> <span class="t-dim">thinking with gemini…</span>`;
      await sleep(80);
    }
    status.innerHTML = `<span class="t-ok">✓ answer ready in ${d.time}</span> <span class="t-dim">· saved to history</span>`;
    answer.innerHTML = d.answer;
    requestAnimationFrame(() => answer.classList.add('show'));

    await sleep(5200);
    i++;
  }
}

if (window.matchMedia('(min-width: 901px)').matches) playTerminal();
