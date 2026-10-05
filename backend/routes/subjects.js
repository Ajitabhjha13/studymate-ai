// Subjects ki list (DBMS, Java, etc.)
const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/subjects
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM subjects ORDER BY id');
    res.json({ subjects: rows });
  } catch (err) {
    console.error('Subjects error:', err.message);
    res.status(500).json({ error: 'Could not load subjects.' });
  }
});

module.exports = router;
