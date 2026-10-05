// Main AI route: student ka question Gemini ko bhejta hai aur answer save karta hai
const express = require('express');
const pool = require('../db');
const { generateAnswer } = require('../gemini');
const { languageRule, getUserLanguage } = require('../helpers');
const auth = require('../middleware/auth');

const router = express.Router();

function systemPrompt(subject, lang) {
  return `You are StudyMate AI, a friendly academic tutor for college students.
The student is currently studying: ${subject}.
- Explain concepts clearly in simple language, with examples where helpful.
- For problems or code, explain step by step.
- Keep answers well organised using short paragraphs and markdown (headings, lists, code blocks) when useful.
- Language: ${languageRule(lang)}
- If a question is not academic, answer briefly and politely guide the student back to studies.`;
}

// POST /api/ask   body: { question, subjectId }
router.post('/', auth, async (req, res) => {
  const question = (req.body.question || '').trim();
  const subjectId = req.body.subjectId ? Number(req.body.subjectId) : null;

  if (!question) {
    return res.status(400).json({ error: 'Please type a question.' });
  }
  if (question.length > 2000) {
    return res.status(400).json({ error: 'Question is too long (max 2000 characters).' });
  }

  try {
    // 1. Subject ka naam nikalna
    let subjectName = 'General';
    if (subjectId) {
      const [rows] = await pool.query('SELECT name FROM subjects WHERE id = ?', [subjectId]);
      if (rows.length === 0) {
        return res.status(400).json({ error: 'Invalid subject.' });
      }
      subjectName = rows[0].name;
    }

    // 2. Isi subject ke pichle 4 sawaal-jawab, taaki AI ko context mile
    //    (jaise student puche "isko aur detail mein samjhao")
    const [previous] = await pool.query(
      `SELECT question, answer FROM chats
       WHERE user_id = ? AND subject_id <=> ?
       ORDER BY created_at DESC, id DESC LIMIT 4`,
      [req.user.id, subjectId]
    );

    const contents = [];
    previous.reverse().forEach((c) => {
      contents.push({ role: 'user', parts: [{ text: c.question }] });
      contents.push({ role: 'model', parts: [{ text: c.answer }] });
    });
    contents.push({ role: 'user', parts: [{ text: question }] });

    // 3. Gemini API call (busy hone par apne aap retry / backup model)
    const { text: answer, model } = await generateAnswer({
      contents,
      systemInstruction: systemPrompt(subjectName, await getUserLanguage(req.user.id)),
    });

    if (!answer) {
      return res.status(502).json({ error: 'AI did not return an answer. Please try again.' });
    }

    // 4. Database mein save karna (history ke liye)
    const [result] = await pool.query(
      'INSERT INTO chats (user_id, subject_id, question, answer) VALUES (?, ?, ?, ?)',
      [req.user.id, subjectId, question, answer]
    );

    res.json({ id: result.insertId, question, answer, subject: subjectName, model });
  } catch (err) {
    console.error('Ask error:', err.message);
    res.status(500).json({ error: 'AI service is not responding right now. Please try again.' });
  }
});

module.exports = router;
