// =========================================================
// admin.js - Admin panel: usage stats, charts, user management
// (Server bhi har request par admin role check karta hai)
// =========================================================

const root = document.getElementById('adminRoot');
let users = [];
let searchTimer = null;

if (requireLogin()) {
  mountShell('admin');
  init();
}

async function init() {
  let overview;
  try {
    overview = await api('/admin/overview');
  } catch (err) {
    root.innerHTML = `<div class="empty-state">
      <div class="locked">${icon('shield', 28)}</div>
      <h3>Admins only</h3>
      <p>${escapeHtml(err.message)} Ask an admin to give your account access.</p>
      <a class="btn btn-ghost" href="dashboard.html">Back to home</a></div>`;
    return;
  }

  const t = overview.totals;
  root.innerHTML = `
    <header class="page-head">
      <div><h1>Admin panel</h1><p>Usage across all students · updated ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</p></div>
      <button class="btn btn-ghost btn-sm" type="button" id="refreshBtn">${icon('refresh', 15)}<span>Refresh</span></button>
    </header>

    <section class="stats admin-stats">
      ${statTile('Students', t.users, `+${t.newUsers} this week`, 'users')}
      ${statTile('Questions asked', t.questions, `${t.today} today`, 'chat')}
      ${statTile('Active this week', t.activeWeek, 'students asking questions', 'trending')}
      ${statTile('Quizzes completed', t.quizzes, 'by all students', 'target')}
      ${statTile('PDFs uploaded', t.documents, 'notes in My Notes', 'file')}
      ${statTile('Avg quiz score', t.avgScore === null ? '–' : `${t.avgScore}%`, 'across all students', 'trophy')}
    </section>

    <section class="panel glass">
      <div class="panel-head"><h2>Questions per day</h2><span class="mono">last 30 days</span></div>
      ${dailyChart(overview.daily)}
    </section>

    <div class="dash-grid admin-grid">
      <section class="panel glass">
        <div class="panel-head"><h2>Popular subjects</h2><span class="mono">by questions asked</span></div>
        ${hbars(overview.bySubject.map((s) => ({ label: s.subject, value: s.count, text: s.count })), 'No questions asked yet.')}
      </section>
      <section class="panel glass">
        <div class="panel-head"><h2>Quiz performance</h2><span class="mono">weakest first</span></div>
        ${hbars(overview.quizBySubject.map((s) => ({ label: s.subject, value: s.avg, max: 100, text: `${s.avg}% · ${s.count}`, score: s.avg })), 'No quizzes completed yet.')}
      </section>
    </div>

    <section class="panel glass users-panel">
      <div class="panel-head"><h2>Students</h2><span class="mono" id="userCount"></span></div>
      <div class="search-box admin-search">
        ${icon('search')}
        <input id="userSearch" type="search" placeholder="Search by name or email…" aria-label="Search users">
      </div>
      <div class="table-wrap"><table class="users-table">
        <thead><tr><th>Student</th><th>Role</th><th class="num">Questions</th><th class="num">Quizzes</th><th class="num">Avg</th><th>Last active</th><th></th></tr></thead>
        <tbody id="userRows"><tr><td colspan="7" class="empty-note">Loading…</td></tr></tbody>
      </table></div>
    </section>`;

  document.getElementById('refreshBtn').onclick = init;
  document.getElementById('userSearch').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadUsers(e.target.value.trim()), 250);
  });
  document.getElementById('userRows').addEventListener('click', onUserAction);
  loadUsers('');
}

function statTile(label, value, sub, iconName) {
  return `<div class="stat glass"><div class="stat-top">${label} ${icon(iconName, 16)}</div>
    <div class="stat-value">${value}</div><div class="stat-sub">${escapeHtml(String(sub))}</div></div>`;
}

// ---------- Charts (plain HTML/CSS, koi library nahi) ----------
function dailyChart(daily) {
  const map = Object.fromEntries(daily.map((d) => [d.day, d.count]));
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ key: localDayKey(d), date: d, n: map[localDayKey(d)] || 0 });
  }
  const max = Math.max(1, ...days.map((d) => d.n));
  const total = days.reduce((s, d) => s + d.n, 0);
  return `<div class="vchart">
      <div class="vchart-bars">
        ${days.map((d) => `<div class="vbar" title="${d.n} question${d.n === 1 ? '' : 's'} on ${d.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}">
          <i style="height:${d.n ? Math.max(4, (d.n / max) * 100) : 0}%"></i></div>`).join('')}
      </div>
      <div class="vchart-axis">
        ${days.map((d, i) => `<span>${i % 5 === 0 || i === 29 ? d.date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</span>`).join('')}
      </div>
    </div>
    <p class="chart-note mono">${total} questions in 30 days · peak ${max === 1 && total === 0 ? 0 : max} in a day</p>`;
}

function hbars(rows, emptyText) {
  if (!rows.length) return `<p class="empty-note">${emptyText}</p>`;
  const max = Math.max(1, ...rows.map((r) => r.max || r.value));
  return `<div class="hbars">${rows.map((r) => {
    const m = subjectMeta(r.label);
    const color = r.score === undefined ? m.color : r.score >= 80 ? 'var(--teal)' : r.score >= 50 ? 'var(--violet)' : 'var(--danger)';
    return `<div class="hbar">
      <span class="hbar-label">${subjectTag(r.label)}<span>${escapeHtml(r.label)}</span></span>
      <span class="hbar-track"><i style="width:${Math.max(2, (r.value / (r.max || max)) * 100)}%;background:${color}"></i></span>
      <span class="hbar-val mono">${r.text}</span>
    </div>`;
  }).join('')}</div>`;
}

// ---------- Users table ----------
async function loadUsers(search) {
  const body = document.getElementById('userRows');
  try {
    users = (await api(`/admin/users?search=${encodeURIComponent(search)}`)).users;
    document.getElementById('userCount').textContent = `${users.length} shown`;
    const me = getUser();
    if (!users.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-note">No students match your search.</td></tr>';
      return;
    }
    body.innerHTML = users.map((u) => {
      const self = me && me.id === u.id;
      return `<tr data-id="${u.id}">
        <td><div class="user-cell"><span class="avatar avatar-sm">${escapeHtml(initials(u.name))}</span>
          <div><strong>${escapeHtml(u.name)}${self ? ' <span class="you">you</span>' : ''}</strong><small>${escapeHtml(u.email)}</small></div></div></td>
        <td><span class="role-badge role-${u.role}">${u.role}</span></td>
        <td class="num mono">${u.questions}</td>
        <td class="num mono">${u.quizzes}</td>
        <td class="num mono">${u.avgScore === null ? '–' : u.avgScore + '%'}</td>
        <td class="mono dim">${u.lastActive ? relativeTime(u.lastActive) : 'never'}</td>
        <td class="row-actions">${self ? '' : `
          <button class="act" type="button" data-role="${u.role === 'admin' ? 'student' : 'admin'}">${icon('shield', 14)}<span>${u.role === 'admin' ? 'Remove admin' : 'Make admin'}</span></button>
          <button class="act danger" type="button" data-delete>${icon('trash', 14)}<span>Delete</span></button>`}</td>
      </tr>`;
    }).join('');
  } catch (err) {
    body.innerHTML = `<tr><td colspan="7" class="empty-note">${escapeHtml(err.message)}</td></tr>`;
  }
}

async function onUserAction(e) {
  const row = e.target.closest('tr[data-id]');
  if (!row) return;
  const u = users.find((x) => x.id === Number(row.dataset.id));
  const roleBtn = e.target.closest('[data-role]');
  const delBtn = e.target.closest('[data-delete]');

  try {
    if (roleBtn) {
      const role = roleBtn.dataset.role;
      if (!confirm(role === 'admin' ? `Give ${u.name} admin access?` : `Remove admin access from ${u.name}?`)) return;
      await api(`/admin/users/${u.id}/role`, { method: 'PATCH', body: { role } });
      showToast('Role updated');
      loadUsers(document.getElementById('userSearch').value.trim());
    }
    if (delBtn) {
      if (!confirm(`Delete ${u.name}'s account and all their data? This cannot be undone.`)) return;
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      showToast('Student deleted');
      init();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}
