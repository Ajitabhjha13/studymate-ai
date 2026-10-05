// =========================================================
// settings.js - Profile, answer language, password, delete account
// =========================================================

let language = 'english';

if (requireLogin()) {
  mountShell('settings');
  loadProfile();
}

function showFormError(id, message) {
  const box = document.getElementById(id);
  box.innerHTML = `${icon('alert', 16)}<span>${escapeHtml(message)}</span>`;
  box.hidden = false;
}

function paintLanguage() {
  document.querySelectorAll('#langGrid .lang').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === language)));
}

async function loadProfile() {
  try {
    const { user, counts } = await api('/profile');
    language = user.answerLanguage;
    document.getElementById('name').value = user.name;
    document.getElementById('email').value = user.email;
    document.getElementById('pAvatar').textContent = initials(user.name);
    document.getElementById('pName').textContent = user.name;
    const joined = new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    document.getElementById('pMeta').textContent = `${user.role === 'admin' ? 'Admin' : 'Student'} · joined ${joined}`;
    document.getElementById('pStats').innerHTML = [
      ['Questions', counts.questions], ['Quizzes', counts.quizzes], ['PDFs', counts.documents],
    ].map(([k, v]) => `<div><strong>${v}</strong><span>${k}</span></div>`).join('');
    paintLanguage();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

document.getElementById('langGrid').addEventListener('click', (e) => {
  const b = e.target.closest('.lang');
  if (!b) return;
  language = b.dataset.v;
  paintLanguage();
});

// ---------- Profile save (UPDATE) ----------
document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveProfile');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const data = await api('/profile', {
      method: 'PUT',
      body: { name: document.getElementById('name').value.trim(), answerLanguage: language },
    });
    saveSession(data.token, data.user);
    document.getElementById('pName').textContent = data.user.name;
    document.getElementById('pAvatar').textContent = initials(data.user.name);
    const info = document.querySelector('.sb-user-info strong');
    if (info) info.textContent = data.user.name;
    showToast('Changes saved');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
});

// ---------- Password ----------
document.getElementById('pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('pwError').hidden = true;
  const cur = document.getElementById('curPw').value;
  const p1 = document.getElementById('newPw').value;
  const p2 = document.getElementById('newPw2').value;
  if (p1.length < 6) return showFormError('pwError', 'New password must be at least 6 characters.');
  if (p1 !== p2) return showFormError('pwError', 'New passwords do not match.');

  const btn = document.getElementById('savePw');
  btn.disabled = true;
  try {
    await api('/profile/password', { method: 'PUT', body: { currentPassword: cur, newPassword: p1 } });
    e.target.reset();
    showToast('Password updated');
  } catch (err) {
    showFormError('pwError', err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Delete account ----------
document.getElementById('deleteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('delError').hidden = true;
  const password = document.getElementById('delPw').value;
  if (!password) return showFormError('delError', 'Enter your password to confirm.');
  if (!confirm('Delete your account and all your data permanently?')) return;
  try {
    await api('/profile', { method: 'DELETE', body: { password } });
    clearSession();
    location.replace('register.html');
  } catch (err) {
    showFormError('delError', err.message);
  }
});
