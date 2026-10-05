// =========================================================
// AI Quiz routes
//   POST /api/quiz/generate     -> Gemini se MCQs banwana
//   POST /api/quiz/:id/submit   -> answers check karna (server par)
//   GET  /api/quiz              -> purane attempts
//   GET  /api/quiz/:id          -> ek quiz dobara kholna / review
// =========================================================
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { generateAnswer } = require('../gemini');

const router = express.Router();
const DIFFICULTIES = ['easy', 'medium', 'hard'];

// Gemini ko bataate hain ki answer exactly is JSON shape mein chahiye
const QUIZ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          answer: { type: 'INTEGER' },
          explanation: { type: 'STRING' },
        },
        required: ['question', 'options', 'answer', 'explanation'],
      },
    },
  },
  required: ['questions'],
};

function buildPrompt({ subject, topic, difficulty, count }) {
  return `Create ${count} multiple-choice questions for a college computer science student.
Subject: ${subject}${topic ? `\nTopic: ${topic}` : ''}
Difficulty: ${difficulty}

Rules:
- Each question has exactly 4 options and exactly one correct option.
- "answer" is the index (0 to 3) of the correct option.
- Mix conceptual questions with small practical or output-based ones.
- Keep options similar in length. Do not use "All of the above" or "None of the above".
- "explanation" is 1 to 2 sentences on why the correct option is right.
- Use markdown backticks for code or SQL inside questions or options.`;
}

// Options ko shuffle karna, taaki sahi answer hamesha A/B par na ho
function shuffleQuestion(q) {
  const correct = q.options[q.answer];
  const options = [...q.options];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    question: q.question.trim(),
    options: options.map((o) => o.trim()),
    answer: options.indexOf(correct),
    explanation: String(q.explanation || '').trim(),
  };
}

// AI ka JSON check karna: galat format wale questions hata dena
function parseQuestions(text) {
  // Sirf bahar ka ```json ... ``` wrapper hatao, questions ke andar ke code blocks nahi
  const clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const data = JSON.parse(clean);
  const list = Array.isArray(data) ? data : data.questions;
  return (list || [])
    .filter((q) => q && typeof q.question === 'string' && q.question.trim() &&
      Array.isArray(q.options) && q.options.length === 4 &&
      q.options.every((o) => typeof o === 'string' && o.trim()) &&
      Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4)
    .map(shuffleQuestion);
}

const asJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v);

// Student ko bina sahi answers ke questions bhejna
const publicQuestions = (qs) => qs.map(({ question, options }) => ({ question, options }));

function resultsOf(questions, answers) {
  return questions.map((q, i) => ({
    question: q.question,
    options: q.options,
    correct: q.answer,
    chosen: answers[i] ?? null,
    explanation: q.explanation,
  }));
}

async function loadQuiz(id, userId) {
  const [rows] = await pool.query(
    `SELECT q.*, COALESCE(s.name, 'General') AS subject
     FROM quizzes q LEFT JOIN subjects s ON s.id = q.subject_id
     WHERE q.id = ? AND q.user_id = ?`,
    [id, userId]
  );
  return rows[0];
}

// ---------- POST /api/quiz/generate ----------
router.post('/generate', auth, async (req, res) => {
  const subjectId = Number(req.body.subjectId) || null;
  const topic = String(req.body.topic || '').trim().slice(0, 100);
  const difficulty = DIFFICULTIES.includes(req.body.difficulty) ? req.body.difficulty : 'medium';
  const count = [5, 10].includes(Number(req.body.count)) ? Number(req.body.count) : 5;

  try {
    let subject = 'General';
    if (subjectId) {
      const [rows] = await pool.query('SELECT name FROM subjects WHERE id = ?', [subjectId]);
      if (!rows.length) return res.status(400).json({ error: 'Invalid subject.' });
      subject = rows[0].name;
    }

    const contents = buildPrompt({ subject, topic, difficulty, count });
    let reply;
    try {
      reply = await generateAnswer({
        contents,
        config: { responseMimeType: 'application/json', responseSchema: QUIZ_SCHEMA },
      });
    } catch (schemaErr) {
      // Agar model schema support na kare to sirf JSON mode mein dobara try
      console.warn('Quiz schema call failed, retrying without schema:', schemaErr.message);
      reply = await generateAnswer({
        contents: contents + '\n\nReply with JSON only: {"questions":[{"question":"","options":["","","",""],"answer":0,"explanation":""}]}',
        config: { responseMimeType: 'application/json' },
      });
    }
    const { text, model } = reply;

    let questions;
    try {
      questions = parseQuestions(text).slice(0, count);
    } catch {
      questions = [];
    }
    if (questions.length < Math.min(3, count)) {
      return res.status(502).json({ error: 'The AI returned an incomplete quiz. Please try again.' });
    }

    const [result] = await pool.query(
      'INSERT INTO quizzes (user_id, subject_id, topic, difficulty, questions, total) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, subjectId, topic || null, difficulty, JSON.stringify(questions), questions.length]
    );

    res.json({
      quizId: result.insertId,
      subject, subjectId, topic, difficulty, model,
      questions: publicQuestions(questions),
    });
  } catch (err) {
    console.error('Quiz generate error:', err.message);
    res.status(500).json({ error: 'Could not create the quiz right now. Please try again.' });
  }
});

// ---------- POST /api/quiz/:id/submit ----------
router.post('/:id/submit', auth, async (req, res) => {
  try {
    const quiz = await loadQuiz(Number(req.params.id), req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });

    const questions = asJson(quiz.questions);

    // Pehle hi submit ho chuka hai to wahi result wapas
    if (quiz.completed_at) {
      return res.json({ score: quiz.score, total: quiz.total, results: resultsOf(questions, asJson(quiz.answers)) });
    }

    const raw = Array.isArray(req.body.answers) ? req.body.answers : [];
    const answers = questions.map((_, i) => (Number.isInteger(raw[i]) && raw[i] >= 0 && raw[i] < 4 ? raw[i] : null));
    const score = questions.reduce((sum, q, i) => sum + (answers[i] === q.answer ? 1 : 0), 0);

    await pool.query(
      'UPDATE quizzes SET answers = ?, score = ?, completed_at = NOW() WHERE id = ?',
      [JSON.stringify(answers), score, quiz.id]
    );

    res.json({ score, total: questions.length, results: resultsOf(questions, answers) });
  } catch (err) {
    console.error('Quiz submit error:', err.message);
    res.status(500).json({ error: 'Could not submit the quiz. Please try again.' });
  }
});

// ---------- GET /api/quiz  (purane attempts) ----------
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT q.id, q.subject_id, COALESCE(s.name, 'General') AS subject, q.topic, q.difficulty,
              q.score, q.total, q.created_at, q.completed_at
       FROM quizzes q LEFT JOIN subjects s ON s.id = q.subject_id
       WHERE q.user_id = ?
       ORDER BY q.created_at DESC, q.id DESC
       LIMIT 30`,
      [req.user.id]
    );
    res.json({ quizzes: rows });
  } catch (err) {
    console.error('Quiz list error:', err.message);
    res.status(500).json({ error: 'Could not load quizzes.' });
  }
});

// ---------- GET /api/quiz/:id  (review ya resume) ----------
router.get('/:id', auth, async (req, res) => {
  try {
    const quiz = await loadQuiz(Number(req.params.id), req.user.id);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found.' });
    const questions = asJson(quiz.questions);
    const base = {
      quizId: quiz.id, subject: quiz.subject, subjectId: quiz.subject_id,
      topic: quiz.topic, difficulty: quiz.difficulty,
    };
    if (quiz.completed_at) {
      return res.json({ ...base, completed: true, score: quiz.score, total: quiz.total, results: resultsOf(questions, asJson(quiz.answers)) });
    }
    res.json({ ...base, completed: false, questions: publicQuestions(questions) });
  } catch (err) {
    console.error('Quiz load error:', err.message);
    res.status(500).json({ error: 'Could not load this quiz.' });
  }
});

module.exports = router;
