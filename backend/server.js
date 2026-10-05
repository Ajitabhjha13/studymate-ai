// ===== AI-Based Q&A Web Application - Main Server =====
require('dotenv').config(); // .env file sabse pehle load honi chahiye

const express = require('express');
const path = require('path');
const pool = require('./db');

const authRoutes = require('./routes/auth');
const subjectRoutes = require('./routes/subjects');
const askRoutes = require('./routes/ask');
const historyRoutes = require('./routes/history');
const quizRoutes = require('./routes/quiz');
const profileRoutes = require('./routes/profile');
const docsRoutes = require('./routes/docs');
const insightsRoutes = require('./routes/insights');
const adminRoutes = require('./routes/admin');

const app = express();
// PDF upload ke liye bada limit (sirf /api/docs par), baaki sab ke liye chhota
app.use('/api/docs', express.json({ limit: '15mb' }));
app.use(express.json({ limit: '100kb' }));

// Frontend (HTML/CSS/JS) isi server se serve hoga
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Health check: server aur database dono chal rahe hain ya nahi
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', database: 'not connected', message: err.message });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/ask', askRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/quiz', quizRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/docs', docsRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/admin', adminRoutes);

// Body bahut badi ho (jaise 10 MB se badi PDF)
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'File is too large. Maximum PDF size is 10 MB.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request data.' });
  next(err);
});

// Galat API URL
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));

// Startup checks
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.startsWith('apni_')) {
  console.warn('WARNING: GEMINI_API_KEY .env file mein set nahi hai!');
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
