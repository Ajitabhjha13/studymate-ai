// =========================================================
// Admin panel APIs (sirf role = 'admin')
// =========================================================
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/admin');
const { removeUserFiles } = require('../helpers');

const router = express.Router();
router.use(auth, adminOnly); // is file ke saare routes protected

const num = (v) => (v === null || v === undefined ? null : Number(v));

// GET /api/admin/overview -> totals, charts ka data
router.get('/overview', async (req, res) => {
  try {
    const [[t]] = await pool.query(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM users WHERE created_at >= CURDATE() - INTERVAL 7 DAY) AS newUsers,
      (SELECT COUNT(*) FROM chats) AS questions,
      (SELECT COUNT(*) FROM chats WHERE created_at >= CURDATE()) AS today,
      (SELECT COUNT(*) FROM quizzes WHERE completed_at IS NOT NULL) AS quizzes,
      (SELECT ROUND(AVG(score / total * 100)) FROM quizzes WHERE completed_at IS NOT NULL) AS avgScore,
      (SELECT COUNT(*) FROM documents) AS documents,
      (SELECT COUNT(DISTINCT user_id) FROM chats WHERE created_at >= CURDATE() - INTERVAL 7 DAY) AS activeWeek`);

    const [daily] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS n
       FROM chats WHERE created_at >= CURDATE() - INTERVAL 29 DAY GROUP BY day`);
    const [bySubject] = await pool.query(
      `SELECT COALESCE(s.name, 'General') AS subject, COUNT(*) AS n
       FROM chats c LEFT JOIN subjects s ON s.id = c.subject_id
       GROUP BY s.name ORDER BY n DESC`);
    const [quizBySubject] = await pool.query(
      `SELECT COALESCE(s.name, 'General') AS subject, COUNT(*) AS n, ROUND(AVG(q.score / q.total * 100)) AS avg
       FROM quizzes q LEFT JOIN subjects s ON s.id = q.subject_id
       WHERE q.completed_at IS NOT NULL GROUP BY s.name ORDER BY avg ASC`);

    res.json({
      totals: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, num(v)])),
      daily: daily.map((d) => ({ day: d.day, count: Number(d.n) })),
      bySubject: bySubject.map((s) => ({ subject: s.subject, count: Number(s.n) })),
      quizBySubject: quizBySubject.map((s) => ({ subject: s.subject, count: Number(s.n), avg: num(s.avg) })),
    });
  } catch (err) {
    console.error('Admin overview error:', err.message);
    res.status(500).json({ error: 'Could not load admin data.' });
  }
});

// GET /api/admin/users?search=abc
router.get('/users', async (req, res) => {
  const search = String(req.query.search || '').trim();
  const like = `%${search}%`;
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
        (SELECT COUNT(*) FROM chats c WHERE c.user_id = u.id) AS questions,
        (SELECT COUNT(*) FROM quizzes q WHERE q.user_id = u.id AND q.completed_at IS NOT NULL) AS quizzes,
        (SELECT ROUND(AVG(q.score / q.total * 100)) FROM quizzes q WHERE q.user_id = u.id AND q.completed_at IS NOT NULL) AS avgScore,
        (SELECT MAX(c.created_at) FROM chats c WHERE c.user_id = u.id) AS lastActive
       FROM users u
       WHERE (? = '' OR u.name LIKE ? OR u.email LIKE ?)
       ORDER BY u.created_at DESC LIMIT 200`,
      [search, like, like]
    );
    res.json({
      users: rows.map((u) => ({ ...u, questions: Number(u.questions), quizzes: Number(u.quizzes), avgScore: num(u.avgScore) })),
    });
  } catch (err) {
    console.error('Admin users error:', err.message);
    res.status(500).json({ error: 'Could not load users.' });
  }
});

// PATCH /api/admin/users/:id/role  body: { role }
router.patch('/users/:id/role', async (req, res) => {
  const id = Number(req.params.id);
  const role = req.body.role;
  if (!['student', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot change your own role.' });
  try {
    const [r] = await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'Role updated.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update the role.' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account here.' });
  try {
    await removeUserFiles(id);
    const [r] = await pool.query('DELETE FROM users WHERE id = ?', [id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'User not found.' });
    res.json({ message: 'User deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete the user.' });
  }
});

module.exports = router;
