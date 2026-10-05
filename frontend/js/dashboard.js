// =========================================================
// dashboard.js - Home page: greeting, ask box, stats,
//                activity heatmap, subjects, recent questions
// =========================================================

const STARTERS = [
  { subject: 'DBMS', q: 'Explain normalization with an example' },
  { subject: 'Data Structures', q: 'Stack vs queue in simple words' },
  { subject: 'Java', q: 'What are the 4 pillars of OOP?' },
  { subject: 'Computer Networks', q: 'How does TCP handshake work?' },
];

if (requireLogin()) {
  mountShell('home');
  initDashboard();
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

async function initDashboard() {
  const user = getUser();
  document.getElementById('greeting').textContent = `${greeting()}, ${user ? user.name.split(' ')[0] : 'there'}`;

  const input = document.getElementById('input');
  const select = document.getElementById('subjectSelect');
  const sendBtn = document.getElementById('sendBtn');
  const counter = document.getElementById('counter');
  const tagSlot = document.getElementById('subjectTagSlot');

  const sync = () => {
    const len = input.value.length;
    counter.textContent = `${len} / 2000`;
    counter.classList.toggle('warn', len > 1800);
    sendBtn.disabled = input.value.trim().length === 0;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 220) + 'px';
  };
  input.addEventListener('input', sync);
  attachVoice(document.getElementById('micBtn'), input, sync);

  const go = () => {
    const q = input.value.trim();
    if (!q) return input.focus();
    location.href = `chat.html?subject=${select.value}&q=${encodeURIComponent(q)}`;
  };
  document.getElementById('composer').addEventListener('submit', (e) => { e.preventDefault(); go(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go(); }
  });

  let subjects = [];
  try {
    subjects = await getSubjects();
  } catch (err) {
    showToast(err.message, 'error');
    return;
  }

  select.innerHTML = subjects.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
  const paintTag = () => { tagSlot.innerHTML = subjectTag(select.options[select.selectedIndex].text); };
  select.addEventListener('change', paintTag);
  paintTag();

  // Starter chips
  document.getElementById('starters').innerHTML = STARTERS.map((s) => {
    const subj = subjects.find((x) => x.name === s.subject) || subjects[0];
    return `<button class="starter-chip" type="button" data-subject="${subj.id}" data-q="${escapeHtml(s.q)}">${subjectTag(subj.name)}${escapeHtml(s.q)}</button>`;
  }).join('');
  document.getElementById('starters').addEventListener('click', (e) => {
    const chip = e.target.closest('.starter-chip');
    if (chip) location.href = `chat.html?subject=${chip.dataset.subject}&q=${encodeURIComponent(chip.dataset.q)}`;
  });

  try {
    loadRecommendations();
    const [stats, { history }] = await Promise.all([api('/history/stats'), api('/history')]);
    renderStats(stats, subjects);
    renderHeatmap(stats.byDay);
    renderSubjects(stats.bySubject, subjects);
    renderRecent(history.slice(0, 6));
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---------- Stats ----------
function renderStats(stats, subjects) {
  const dayMap = Object.fromEntries(stats.byDay.map((d) => [d.day, d.count]));

  let week = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    week += dayMap[localDayKey(d)] || 0;
  }

  // Streak: aaj (ya kal) se peeche lagatar kitne din sawaal puche
  let streak = 0;
  const d = new Date();
  if (!dayMap[localDayKey(d)]) d.setDate(d.getDate() - 1);
  while (dayMap[localDayKey(d)]) { streak++; d.setDate(d.getDate() - 1); }

  const explored = stats.bySubject.filter((s) => s.count > 0).length;

  document.getElementById('stTotal').textContent = stats.total;
  document.getElementById('stWeek').textContent = week;
  document.getElementById('stStreak').textContent = streak;
  document.getElementById('stStreakSub').textContent = streak ? 'Keep it going' : 'Ask today to start one';
  document.getElementById('stSubjects').textContent = explored;
  document.getElementById('stSubjectsSub').textContent = `of ${subjects.length} subjects`;
}

// ---------- GitHub-style activity heatmap ----------
function renderHeatmap(byDay) {
  const WEEKS = 53; // poora saal, GitHub jaisa
  const dayMap = Object.fromEntries(byDay.map((d) => [d.day, d.count]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (WEEKS - 1) * 7); // Sunday se shuru

  const level = (n) => (n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4);
  const cells = [];
  const months = [];
  let total = 0;
  let activeDays = 0;
  let lastMonth = -1;

  for (let w = 0; w < WEEKS; w++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + r);
      if (r === 0) {
        const m = d.getMonth();
        months.push(m !== lastMonth ? d.toLocaleDateString('en-IN', { month: 'short' }) : '');
        lastMonth = m;
      }
      if (d > today) { cells.push('<i class="hm future"></i>'); continue; }
      const n = dayMap[localDayKey(d)] || 0;
      total += n;
      if (n) activeDays++;
      const label = `${n} question${n === 1 ? '' : 's'} on ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
      const isToday = d.getTime() === today.getTime();
      cells.push(`<i class="hm l${level(n)}${isToday ? ' today' : ''}" title="${label}"></i>`);
    }
  }

  document.getElementById('heatmap').innerHTML = cells.join('');
  document.getElementById('heatMonths').innerHTML = months.map((m) => `<span>${m}</span>`).join('');
  document.getElementById('heatSummary').textContent = `${total} questions · ${activeDays} active days · last 12 months`;
  const wrap = document.querySelector('.heat-wrap');
  if (wrap.scrollWidth > wrap.clientWidth + 4) wrap.scrollLeft = wrap.scrollWidth; // chhoti screen par latest week dikhe
}

// ---------- Subject cards with progress bars ----------
function renderSubjects(bySubject, subjects) {
  const counts = Object.fromEntries(bySubject.map((s) => [s.subjectId, s.count]));
  const max = Math.max(1, ...Object.values(counts));
  document.getElementById('subjectCards').innerHTML = subjects.map((s) => {
    const n = counts[s.id] || 0;
    const m = subjectMeta(s.name);
    return `<a class="subject-card" href="chat.html?subject=${s.id}" style="--c:${m.color}">
      <div class="subject-card-top">${subjectTag(s.name)}${icon('arrowRight', 16)}</div>
      <div><strong>${escapeHtml(s.name)}</strong><small>${n ? `${n} question${n > 1 ? 's' : ''}` : 'not started'}</small></div>
      <div class="bar"><i style="width:${n ? Math.max(6, (n / max) * 100) : 0}%"></i></div>
    </a>`;
  }).join('');
}

// ---------- Recent questions ----------
function renderRecent(items) {
  const list = document.getElementById('recentList');
  if (items.length === 0) {
    list.innerHTML = '<li class="empty-note">Your recent questions will appear here.<br>Ask your first one above.</li>';
    return;
  }
  list.innerHTML = items.map((h) => `
    <li><a href="chat.html?subject=${h.subject_id || 1}">
      ${subjectTag(h.subject)}
      <div class="recent-body"><div class="recent-q">${escapeHtml(h.question)}</div></div>
      <span class="recent-time">${relativeTime(h.created_at)}</span>
    </a></li>`).join('');
}

// ---------- Smart revision suggestions ----------
const REC_ICONS = { weak: 'alert', topic: 'bulb', test: 'target', stale: 'clock', strong: 'trending', new: 'sparkles' };

async function loadRecommendations() {
  const box = document.getElementById('recs');
  try {
    const { recommendations } = await api('/insights');
    if (!recommendations.length) {
      box.innerHTML = '<p class="empty-note">Ask a few questions and take a quiz. Suggestions will appear here based on your scores.</p>';
      return;
    }
    box.innerHTML = recommendations.map((r) => `
      <a class="rec rec-${r.type}" href="${r.action.href}">
        <div class="rec-top"><span class="rec-icon">${icon(REC_ICONS[r.type] || 'sparkles', 16)}</span>${subjectTag(r.subject)}</div>
        <strong>${escapeHtml(r.title)}</strong>
        <p>${escapeHtml(r.reason)}</p>
        <span class="rec-action">${escapeHtml(r.action.label)}${icon('arrowRight', 14)}</span>
      </a>`).join('');
  } catch (err) {
    box.innerHTML = `<p class="empty-note">${escapeHtml(err.message)}</p>`;
  }
}

document.getElementById('planBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const plan = document.getElementById('plan');
  plan.hidden = false;
  plan.innerHTML = `<div class="plan-head">${icon('sparkles', 15)}<span class="shimmer-text">Building your 3-day plan…</span></div>
    <div class="skeleton"><i></i><i></i><i></i></div>`;
  btn.disabled = true;
  try {
    const { plan: text } = await api('/insights/plan', { method: 'POST' });
    plan.innerHTML = `<div class="plan-head">${icon('sparkles', 15)}<span>Your 3-day revision plan</span>
      <button class="icon-btn" type="button" id="closePlan" aria-label="Close plan">${icon('x', 16)}</button></div>
      <div class="prose">${renderMarkdown(text)}</div>`;
    document.getElementById('closePlan').onclick = () => { plan.hidden = true; };
  } catch (err) {
    plan.innerHTML = `<div class="msg-error">${icon('alert', 18)}<span>${escapeHtml(err.message)}</span></div>`;
  } finally {
    btn.disabled = false;
  }
});
