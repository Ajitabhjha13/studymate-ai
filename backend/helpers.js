// Chhote shared helpers: login token, user object, language rule, file cleanup
const jwt = require('jsonwebtoken');
const fs = require('fs/promises');
const path = require('path');
const pool = require('./db');

const UPLOAD_DIR = path.join(__dirname, 'uploads');

function makeToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Database row -> frontend ko bhejne wala user (password hash kabhi nahi)
function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role || 'student',
    answerLanguage: row.answer_language || 'english',
    createdAt: row.created_at,
  };
}

const LANGUAGE_RULES = {
  english: 'Answer in clear, simple English.',
  hindi: 'Answer in Hindi using Devanagari script. Keep technical terms (for example "primary key", "TCP", "array") in English.',
  hinglish: 'Answer in Hinglish: Hindi written in Roman script mixed naturally with English, the way Indian college students talk. Keep technical terms in English.',
};

function languageRule(lang) {
  return (LANGUAGE_RULES[lang] || LANGUAGE_RULES.english) +
    ' If the student explicitly asks for a different language in their message, follow that request.';
}

async function getUserLanguage(userId) {
  const [rows] = await pool.query('SELECT answer_language FROM users WHERE id = ?', [userId]);
  return rows[0] ? rows[0].answer_language : 'english';
}

// User delete hone se pehle uski uploaded PDFs disk se hatana
async function removeUserFiles(userId) {
  const [docs] = await pool.query('SELECT file_name FROM documents WHERE user_id = ?', [userId]);
  await Promise.all(docs.map((d) => fs.unlink(path.join(UPLOAD_DIR, d.file_name)).catch(() => {})));
}

module.exports = { makeToken, publicUser, languageRule, getUserLanguage, removeUserFiles, UPLOAD_DIR };
