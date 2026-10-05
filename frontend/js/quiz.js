// =========================================================
// quiz.js - AI Quiz: setup -> generate -> play -> results
// Sahi answers server par check hote hain (browser ko pehle nahi milte)
// =========================================================

const root = document.getElementById('quizRoot');
const scroller = document.getElementById('quizPage');
const LETTERS = ['A', 'B', 'C', 'D'];

const settings = { subjectId: null, topic: '', difficulty: 'medium', count: 5 };
let subjects = [];
let quiz = null;        // { quizId, subject, topic, difficulty, questions }
let answers = [];       // student ke chune hue options
let current = 0;

if (requireLogin()) {
  mountShell('quiz');
  init();
}

async function init() {
  try {
    subjects = await getSubjects();
  } catch (err) {
    showError(err.message, init);
    return;
  }
  const q = new URLSearchParams(location.search);
  settings.subjectId = Number(q.get('subject')) || (subjects.find((s) => s.name === 'DBMS') || subjects[0]).id;
  if (['easy', 'medium', 'hard'].includes(q.get('difficulty'))) settings.difficulty = q.get('difficulty');
  if (q.get('topic')) settings.topic = q.get('topic').slice(0, 100);
  showSetup();
}

const subjectName = (id) => (subjects.find((s) => s.id === Number(id)) || { name: 'General' }).name;
const toTop = () => scroller.scrollTo({ top: 0 });

// =========================================================
// 1. SETUP SCREEN
// =========================================================
function showSetup() {
  quiz = null;
  root.innerHTML = `
    <header class="page-head">
      <div><h1>Quiz</h1><p>AI-generated MCQs to test what you have learned</p></div>
    </header>

    <div class="quiz-layout">
      <form class="panel glass quiz-setup" id="setupForm">
        <div class="field">
          <label>Subject</label>
          <div class="pick-grid" id="subjectPick" role="radiogroup" aria-label="Subject">
            ${subjects.map((s) => `<button type="button" class="pick" role="radio" data-id="${s.id}"
                aria-checked="${s.id === settings.subjectId}">${subjectTag(s.name)}<span>${escapeHtml(s.name)}</span></button>`).join('')}
          </div>
        </div>

        <div class="field">
          <label for="topic">Topic <span class="optional">optional</span></label>
          <div class="input-wrap">${icon('search', 17)}
            <input class="input" id="topic" maxlength="100" placeholder="e.g. Normalization, joins, keys" value="${escapeHtml(settings.topic)}">
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <label>Difficulty</label>
            <div class="seg" id="diffSeg" role="radiogroup" aria-label="Difficulty">
              ${['easy', 'medium', 'hard'].map((d) => `<button type="button" role="radio" data-v="${d}" aria-checked="${settings.difficulty === d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}
            </div>
          </div>
          <div class="field">
            <label>Questions</label>
            <div class="seg" id="countSeg" role="radiogroup" aria-label="Number of questions">
              ${[5, 10].map((n) => `<button type="button" role="radio" data-v="${n}" aria-checked="${settings.count === n}">${n}</button>`).join('')}
            </div>
          </div>
        </div>

        <button class="btn btn-primary btn-lg btn-block" type="submit">${icon('sparkles', 17)}Generate quiz</button>
        <p class="setup-note">Questions are made fresh by Gemini every time, so no two quizzes are the same.</p>
      </form>

      <aside class="panel glass quiz-past">
        <div class="panel-head"><h2>Past attempts</h2><span class="mono" id="avgScore"></span></div>
        <ul class="attempts" id="attempts"><li class="empty-note">Loading…</li></ul>
      </aside>
    </div>`;

  const pickRadio = (groupId, onPick) => {
    document.getElementById(groupId).addEventListener('click', (e) => {
      const btn = e.target.closest('[role="radio"]');
      if (!btn) return;
      btn.parentElement.querySelectorAll('[role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      onPick(btn);
    });
  };
  pickRadio('subjectPick', (b) => { settings.subjectId = Number(b.dataset.id); });
  pickRadio('diffSeg', (b) => { settings.difficulty = b.dataset.v; });
  pickRadio('countSeg', (b) => { settings.count = Number(b.dataset.v); });

  document.getElementById('setupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    settings.topic = document.getElementById('topic').value.trim();
    generateQuiz();
  });

  loadAttempts();
}

async function loadAttempts() {
  const list = document.getElementById('attempts');
  try {
    const { quizzes } = await api('/quiz');
    if (!list.isConnected) return;
    const done = quizzes.filter((q) => q.completed_at);
    if (done.length) {
      const avg = Math.round(done.reduce((s, q) => s + (q.score / q.total) * 100, 0) / done.length);
      document.getElementById('avgScore').textContent = `avg ${avg}% · ${done.length} done`;
    }
    if (!quizzes.length) {
      list.innerHTML = '<li class="empty-note">No quizzes yet. Your scores will show up here.</li>';
      return;
    }
    list.innerHTML = quizzes.map((q) => {
      const pct = q.completed_at ? Math.round((q.score / q.total) * 100) : null;
      const badge = pct === null
        ? '<span class="score-badge pending">resume</span>'
        : `<span class="score-badge ${scoreClass(pct)}">${q.score}/${q.total}</span>`;
      return `<li><button type="button" class="attempt" data-id="${q.id}">
        ${subjectTag(q.subject)}
        <span class="attempt-body"><strong>${escapeHtml(q.topic || q.subject)}</strong>
          <small>${q.difficulty} · ${relativeTime(q.created_at)}</small></span>
        ${badge}</button></li>`;
    }).join('');
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.attempt');
      if (b) openAttempt(Number(b.dataset.id));
    });
  } catch (err) {
    list.innerHTML = `<li class="empty-note">${escapeHtml(err.message)}</li>`;
  }
}

async function openAttempt(id) {
  showLoading('Opening quiz…');
  try {
    const data = await api(`/quiz/${id}`);
    if (data.completed) {
      quiz = { ...data, questions: data.results };
      showResults(data);
    } else {
      startPlaying(data);
    }
  } catch (err) {
    showError(err.message, showSetup);
  }
}

// =========================================================
// 2. GENERATE
// =========================================================
async function generateQuiz() {
  const name = subjectName(settings.subjectId);
  showLoading(`Writing ${settings.count} ${settings.difficulty} questions on ${settings.topic || name}…`);
  const slow = setTimeout(() => {
    const t = document.querySelector('.loading-text');
    if (t) t.textContent = 'Model is busy, retrying with a backup model…';
  }, 9000);

  try {
    const data = await api('/quiz/generate', { method: 'POST', body: settings });
    startPlaying(data);
  } catch (err) {
    showError(err.message, generateQuiz);
  } finally {
    clearTimeout(slow);
  }
}

function showLoading(text) {
  toTop();
  root.innerHTML = `
    <div class="quiz-loading">
      <div class="orb orb-lg busy"><span></span></div>
      <p class="shimmer-text loading-text">${escapeHtml(text)}</p>
      <div class="skeleton" style="width:min(420px,80vw)"><i></i><i></i><i></i></div>
    </div>`;
}

function showError(message, retry) {
  root.innerHTML = `
    <div class="empty-state">
      <h3>Something went wrong</h3>
      <p>${escapeHtml(message)}</p>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" type="button" id="retryBtn">${icon('refresh', 16)}Try again</button>
        <button class="btn btn-ghost" type="button" id="backBtn">Back to setup</button>
      </div>
    </div>`;
  document.getElementById('retryBtn').onclick = retry;
  document.getElementById('backBtn').onclick = showSetup;
}

// =========================================================
// 3. PLAY
// =========================================================
function startPlaying(data) {
  quiz = data;
  answers = new Array(quiz.questions.length).fill(null);
  current = 0;
  renderQuestion();
}

function renderQuestion() {
  toTop();
  const total = quiz.questions.length;
  const q = quiz.questions[current];
  const chosen = answers[current];
  const last = current === total - 1;
  const answered = answers.filter((a) => a !== null).length;

  root.innerHTML = `
    <div class="quiz-play">
      <div class="quiz-top">
        <div class="quiz-meta">${subjectTag(quiz.subject)}<span>${escapeHtml(quiz.topic || quiz.subject)}</span>
          <span class="diff diff-${quiz.difficulty}">${quiz.difficulty}</span></div>
        <button class="btn btn-ghost btn-sm" type="button" id="quitBtn">${icon('x', 15)}Quit</button>
      </div>

      <div class="q-progress" aria-hidden="true">
        ${quiz.questions.map((_, i) => `<i class="${i === current ? 'now' : answers[i] !== null ? 'done' : ''}"></i>`).join('')}
      </div>

      <section class="q-card glass">
        <div class="q-count mono">Question ${current + 1} of ${total}</div>
        <div class="q-text prose">${renderMarkdown(q.question)}</div>
        <div class="options" role="radiogroup" aria-label="Options">
          ${q.options.map((o, i) => `
            <button type="button" class="option" role="radio" data-i="${i}" aria-checked="${chosen === i}">
              <kbd>${LETTERS[i]}</kbd><span>${renderInline(o)}</span>
            </button>`).join('')}
        </div>
      </section>

      <div class="quiz-nav">
        <button class="btn btn-ghost" type="button" id="prevBtn" ${current === 0 ? 'disabled' : ''}>${icon('arrowLeft', 16)}Back</button>
        <span class="quiz-hint">Press <kbd>A</kbd>–<kbd>D</kbd> to choose, <kbd>Enter</kbd> to continue</span>
        <button class="btn btn-primary" type="button" id="nextBtn" ${chosen === null ? 'disabled' : ''}>
          ${last ? `Submit quiz${answered < total ? ` (${answered}/${total})` : ''}` : 'Next'}${icon(last ? 'check' : 'arrowRight', 16)}
        </button>
      </div>
    </div>`;

  root.querySelector('.options').addEventListener('click', (e) => {
    const opt = e.target.closest('.option');
    if (opt) choose(Number(opt.dataset.i));
  });
  document.getElementById('prevBtn').onclick = () => { if (current > 0) { current--; renderQuestion(); } };
  document.getElementById('nextBtn').onclick = next;
  document.getElementById('quitBtn').onclick = () => {
    if (confirm('Leave this quiz? You can resume it later from Past attempts.')) showSetup();
  };
}

function choose(i) {
  answers[current] = i;
  root.querySelectorAll('.option').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.i) === i)));
  const nextBtn = document.getElementById('nextBtn');
  nextBtn.disabled = false;
  if (current === quiz.questions.length - 1) {
    const answered = answers.filter((a) => a !== null).length;
    const total = quiz.questions.length;
    nextBtn.innerHTML = `Submit quiz${answered < total ? ` (${answered}/${total})` : ''}${icon('check', 16)}`;
  }
}

function next() {
  if (answers[current] === null) return;
  if (current < quiz.questions.length - 1) {
    current++;
    renderQuestion();
  } else {
    submitQuiz();
  }
}

// Keyboard: A-D / 1-4 se option, Enter se aage
document.addEventListener('keydown', (e) => {
  if (!root.querySelector('.quiz-play') || isTyping(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
  const key = e.key.toUpperCase();
  const idx = LETTERS.indexOf(key) >= 0 ? LETTERS.indexOf(key) : ['1', '2', '3', '4'].indexOf(key);
  if (idx >= 0) { e.preventDefault(); choose(idx); }
  if (e.key === 'Enter') { e.preventDefault(); next(); }
});

async function submitQuiz() {
  const unanswered = answers.filter((a) => a === null).length;
  if (unanswered && !confirm(`${unanswered} question${unanswered > 1 ? 's are' : ' is'} unanswered. Submit anyway?`)) return;

  showLoading('Checking your answers…');
  try {
    const data = await api(`/quiz/${quiz.quizId}/submit`, { method: 'POST', body: { answers } });
    showResults(data);
  } catch (err) {
    showError(err.message, submitQuiz);
  }
}

// =========================================================
// 4. RESULTS
// =========================================================
function scoreClass(pct) {
  if (pct >= 80) return 'great';
  if (pct >= 50) return 'good';
  return 'low';
}

function scoreMessage(pct) {
  if (pct === 100) return ['Perfect score!', 'You got every question right. Try a harder level next.'];
  if (pct >= 80) return ['Excellent work', 'You clearly know this topic. Review the one or two you missed.'];
  if (pct >= 50) return ['Good effort', 'You are on the right track. Read the explanations below for the ones you missed.'];
  return ['Keep practising', 'Go through the explanations below, then ask StudyMate to explain the tricky ones.'];
}

function showResults(data) {
  toTop();
  const pct = Math.round((data.score / data.total) * 100);
  const [title, sub] = scoreMessage(pct);
  const R = 54;
  const C = 2 * Math.PI * R;
  const wrong = data.results.filter((r) => r.chosen !== r.correct).length;

  root.innerHTML = `
    <section class="result-hero panel glass">
      <div class="ring ${scoreClass(pct)}">
        <svg viewBox="0 0 128 128" aria-hidden="true">
          <circle cx="64" cy="64" r="${R}" class="ring-bg"/>
          <circle cx="64" cy="64" r="${R}" class="ring-fg" stroke-dasharray="${C}" stroke-dashoffset="${C}" id="ringFg"/>
        </svg>
        <div class="ring-label"><strong id="pctNum">0%</strong><span>${data.score} / ${data.total}</span></div>
      </div>
      <div class="result-copy">
        <div class="quiz-meta">${subjectTag(quiz.subject)}<span>${escapeHtml(quiz.topic || quiz.subject)}</span>
          <span class="diff diff-${quiz.difficulty}">${quiz.difficulty}</span></div>
        <h2>${title}</h2>
        <p>${sub}</p>
        <div class="result-actions">
          <button class="btn btn-primary" type="button" id="againBtn">${icon('refresh', 16)}New quiz, same settings</button>
          <button class="btn btn-ghost" type="button" id="setupBtn">Change settings</button>
        </div>
      </div>
    </section>

    <div class="review-head"><h2>Review answers</h2><span class="mono">${data.total - wrong} correct · ${wrong} to review</span></div>
    <div class="review-list">
      ${data.results.map((r, i) => reviewHtml(r, i)).join('')}
    </div>`;

  // Score ring animation
  requestAnimationFrame(() => {
    document.getElementById('ringFg').style.strokeDashoffset = C * (1 - pct / 100);
    const num = document.getElementById('pctNum');
    if (prefersReducedMotion()) { num.textContent = `${pct}%`; return; }
    const start = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - start) / 900);
      num.textContent = `${Math.round(pct * (1 - Math.pow(1 - k, 3)))}%`;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  document.getElementById('againBtn').onclick = () => {
    settings.subjectId = quiz.subjectId || settings.subjectId;
    settings.topic = quiz.topic || '';
    settings.difficulty = quiz.difficulty;
    generateQuiz();
  };
  document.getElementById('setupBtn').onclick = showSetup;
}

function reviewHtml(r, i) {
  const ok = r.chosen === r.correct;
  const skipped = r.chosen === null;
  const askText = `Explain this quiz question to me:\n\n${r.question}\n\nOptions: ${r.options.map((o, k) => `${LETTERS[k]}) ${o}`).join('  ')}\nCorrect answer: ${LETTERS[r.correct]}`;
  return `
    <article class="review ${ok ? 'is-ok' : 'is-wrong'}">
      <div class="review-top">
        <span class="review-status">${icon(ok ? 'check' : 'x', 15)}</span>
        <span class="mono">Q${i + 1}${skipped ? ' · skipped' : ''}</span>
      </div>
      <div class="prose review-q">${renderMarkdown(r.question)}</div>
      <ul class="review-options">
        ${r.options.map((o, k) => {
          const cls = k === r.correct ? 'correct' : k === r.chosen ? 'wrong' : '';
          const note = k === r.correct ? 'Correct answer' : k === r.chosen ? 'Your answer' : '';
          return `<li class="${cls}"><kbd>${LETTERS[k]}</kbd><span>${renderInline(o)}</span>${note ? `<small>${note}</small>` : ''}</li>`;
        }).join('')}
      </ul>
      ${r.explanation ? `<div class="explain">${icon('sparkles', 15)}<div>${renderInline(r.explanation)}</div></div>` : ''}
      ${ok ? '' : `<a class="act ask-link" href="chat.html?subject=${quiz.subjectId || 1}&q=${encodeURIComponent(askText)}">${icon('chat', 14)}<span>Ask StudyMate to explain</span></a>`}
    </article>`;
}
