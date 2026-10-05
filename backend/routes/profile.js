// Profile & settings: naam, answer language, password, account delete
const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const auth = require('../middleware/auth');
const { makeToken, publicUser, removeUserFiles } = require('../helpers');

const router = express.Router();
const LANGUAGES = ['english', 'hindi', 'hinglish'];

// GET /api/profile -> account info + kuch counts
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Account not found.' });
    const [[counts]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM chats WHERE user_id = ?) AS questions,
         (SELECT COUNT(*) FROM quizzes WHERE user_id = ? AND completed_at IS NOT NULL) AS quizzes,
         (SELECT COUNT(*) FROM documents WHERE user_id = ?) AS documents`,
      [req.user.id, req.user.id, req.user.id]
    );
    res.json({ user: publicUser(rows[0]), counts });
  } catch (err) {
    console.error('Profile error:', err.message);
    res.status(500).json({ error: 'Could not load your profile.' });
  }
});

// PUT /api/profile  body: { name, answerLanguage }   (UPDATE operation)
router.put('/', auth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const lang = req.body.answerLanguage;

  if (!name) return res.status(400).json({ error: 'Name cannot be empty.' });
  if (name.length > 100) return res.status(400).json({ error: 'Name is too long.' });
  if (!LANGUAGES.includes(lang)) return res.status(400).json({ error: 'Please choose a valid language.' });

  try {
    await pool.query('UPDATE users SET name = ?, answer_language = ? WHERE id = ?', [name, lang, req.user.id]);
    const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const user = publicUser(rows[0]);
    res.json({ user, token: makeToken(user) }); // naam badla to naya token
  } catch (err) {
    console.error('Profile update error:', err.message);
    res.status(500).json({ error: 'Could not save your changes.' });
  }
});

// PUT /api/profile/password  body: { currentPassword, newPassword }
router.put('/password', auth, async (req, res) => {
  const { currentPassword = '', newPassword = '' } = req.body;
  if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });

  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(currentPassword, rows[0].password_hash))) {
      return res.status(400).json({ error: 'Your current password is incorrect.' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.user.id]);
    res.json({ message: 'Password updated.' });
  } catch (err) {
    console.error('Password error:', err.message);
    res.status(500).json({ error: 'Could not update your password.' });
  }
});

// DELETE /api/profile  body: { password }  -> account aur saara data delete
router.delete('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0] || !(await bcrypt.compare(req.body.password || '', rows[0].password_hash))) {
      return res.status(400).json({ error: 'Password is incorrect.' });
    }
    await removeUserFiles(req.user.id);
    await pool.query('DELETE FROM users WHERE id = ?', [req.user.id]); // CASCADE se chats, quizzes, docs bhi
    res.json({ message: 'Account deleted.' });
  } catch (err) {
    console.error('Delete account error:', err.message);
    res.status(500).json({ error: 'Could not delete your account.' });
  }
});

module.exports = router;
