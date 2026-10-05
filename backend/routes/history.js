// Question history: dekhna aur delete karna
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

// GET /api/history?subjectId=2   (subjectId optional)
router.get('/', auth, async (req, res) => {
  try {
    const params = [req.user.id];
    let filter = '';
    if (req.query.subjectId) {
      filter = 'AND c.subject_id = ?';
      params.push(Number(req.query.subjectId));
    }

    const [rows] = await pool.query(
      `SELECT c.id, c.question, c.answer, c.created_at,
              c.subject_id, COALESCE(s.name, 'General') AS subject
       FROM chats c
       LEFT JOIN subjects s ON s.id = c.subject_id
       WHERE c.user_id = ? ${filter}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT 300`,
      params
    );
    res.json({ history: rows });
  } catch (err) {
    console.error('History error:', err.message);
    res.status(500).json({ error: 'Could not load history.' });
  }
});

// GET /api/history/stats -> dashboard ke liye counts (subject-wise aur day-wise)
router.get('/stats', auth, async (req, res) => {
  try {
    const [bySubject] = await pool.query(
      'SELECT subject_id, COUNT(*) AS n FROM chats WHERE user_id = ? GROUP BY subject_id',
      [req.user.id]
    );
    const [byDay] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS day, COUNT(*) AS n
       FROM chats
       WHERE user_id = ? AND created_at >= CURDATE() - INTERVAL 372 DAY
       GROUP BY day`,
      [req.user.id]
    );
    const total = bySubject.reduce((sum, r) => sum + Number(r.n), 0);
    res.json({
      total,
      bySubject: bySubject.map((r) => ({ subjectId: r.subject_id, count: Number(r.n) })),
      byDay: byDay.map((r) => ({ day: r.day, count: Number(r.n) })),
    });
  } catch (err) {
    console.error('Stats error:', err.message);
    res.status(500).json({ error: 'Could not load stats.' });
  }
});

// DELETE /api/history/:id  -> ek chat delete
router.delete('/:id', auth, async (req, res) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM chats WHERE id = ? AND user_id = ?',
      [Number(req.params.id), req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Chat not found.' });
    }
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: 'Could not delete.' });
  }
});

// DELETE /api/history  -> saari history delete
router.delete('/', auth, async (req, res) => {
  try {
    await pool.query('DELETE FROM chats WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'History cleared.' });
  } catch (err) {
    console.error('Clear error:', err.message);
    res.status(500).json({ error: 'Could not clear history.' });
  }
});

module.exports = router;
