// =========================================================
// PDF Notes Q&A
//   GET    /api/docs              -> meri PDFs
//   POST   /api/docs              -> PDF upload (base64 JSON)
//   DELETE /api/docs/:id          -> PDF delete
//   GET    /api/docs/:id/file     -> PDF dekhna
//   GET    /api/docs/:id/chats    -> is PDF ke sawaal-jawab
//   POST   /api/docs/:id/ask      -> PDF se sawaal (Gemini PDF padhta hai)
// =========================================================
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const pool = require('../db');
const auth = require('../middleware/auth');
const { generateAnswer } = require('../gemini');
const { languageRule, getUserLanguage, UPLOAD_DIR } = require('../helpers');

const router = express.Router();
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

const MAX_DOCS = Number(process.env.MAX_DOCS) || 20;
const DOC_COLS = 'd.id, d.user_id, d.name, d.file_name, d.size_bytes, d.created_at';

// Sirf details (PDF ka data nahi), taaki list fast rahe
async function loadDoc(id, userId) {
  const [rows] = await pool.query(`SELECT ${DOC_COLS} FROM documents d WHERE d.id = ? AND d.user_id = ?`, [id, userId]);
  return rows[0];
}

// PDF ka asli data: pehle database se (cloud), warna purani local file se
async function readPdf(doc) {
  const [rows] = await pool.query('SELECT file_data FROM documents WHERE id = ?', [doc.id]);
  if (rows[0] && rows[0].file_data) return rows[0].file_data;
  return fs.readFile(path.join(UPLOAD_DIR, doc.file_name));
}

const docJson = (d) => ({ id: d.id, name: d.name, size: d.size_bytes, createdAt: d.created_at, questions: Number(d.questions || 0) });

// GET /api/docs
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${DOC_COLS}, (SELECT COUNT(*) FROM doc_chats c WHERE c.document_id = d.id) AS questions
       FROM documents d WHERE d.user_id = ? ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json({ documents: rows.map(docJson) });
  } catch (err) {
    console.error('Docs list error:', err.message);
    res.status(500).json({ error: 'Could not load your notes.' });
  }
});

// POST /api/docs   body: { name, data }   (data = PDF ka base64)
router.post('/', auth, async (req, res) => {
  const original = path.basename(String(req.body.name || 'notes.pdf')).slice(0, 200);
  let buffer;
  try {
    buffer = Buffer.from(String(req.body.data || ''), 'base64');
  } catch {
    return res.status(400).json({ error: 'Could not read the file.' });
  }

  if (!buffer.length) return res.status(400).json({ error: 'The file is empty.' });
  if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'PDF must be 10 MB or smaller.' });
  // Asli PDF file "%PDF-" se shuru hoti hai (sirf extension par bharosa nahi)
  if (buffer.subarray(0, 5).toString() !== '%PDF-') {
    return res.status(400).json({ error: 'Only PDF files are supported.' });
  }

  try {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM documents WHERE user_id = ?', [req.user.id]);
    if (n >= MAX_DOCS) return res.status(400).json({ error: `You can keep up to ${MAX_DOCS} PDFs. Delete one to upload more.` });

    // PDF database mein save hoti hai (cloud servers par disk files restart par mit jaati hain)
    const fileName = `${req.user.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.pdf`;
    const [result] = await pool.query(
      'INSERT INTO documents (user_id, name, file_name, size_bytes, file_data) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, original.toLowerCase().endsWith('.pdf') ? original : `${original}.pdf`, fileName, buffer.length, buffer]
    );
    const doc = await loadDoc(result.insertId, req.user.id);
    res.status(201).json({ document: docJson(doc) });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Could not save the PDF.' });
  }
});

// DELETE /api/docs/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const doc = await loadDoc(Number(req.params.id), req.user.id);
    if (!doc) return res.status(404).json({ error: 'PDF not found.' });
    await pool.query('DELETE FROM documents WHERE id = ?', [doc.id]);
    await fs.unlink(path.join(UPLOAD_DIR, doc.file_name)).catch(() => {});
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error('Doc delete error:', err.message);
    res.status(500).json({ error: 'Could not delete the PDF.' });
  }
});

// GET /api/docs/:id/file
router.get('/:id/file', auth, async (req, res) => {
  try {
    const doc = await loadDoc(Number(req.params.id), req.user.id);
    if (!doc) return res.status(404).json({ error: 'PDF not found.' });
    let data;
    try { data = await readPdf(doc); } catch { return res.status(410).json({ error: 'The file is missing. Please upload it again.' }); }
    res.type('application/pdf').send(data);
  } catch (err) {
    res.status(500).json({ error: 'Could not open the PDF.' });
  }
});

// GET /api/docs/:id/chats
router.get('/:id/chats', auth, async (req, res) => {
  try {
    const doc = await loadDoc(Number(req.params.id), req.user.id);
    if (!doc) return res.status(404).json({ error: 'PDF not found.' });
    const [rows] = await pool.query(
      'SELECT id, question, answer, created_at FROM doc_chats WHERE document_id = ? ORDER BY created_at ASC, id ASC LIMIT 60',
      [doc.id]
    );
    res.json({ chats: rows });
  } catch (err) {
    res.status(500).json({ error: 'Could not load this conversation.' });
  }
});

// POST /api/docs/:id/ask   body: { question }
router.post('/:id/ask', auth, async (req, res) => {
  const question = String(req.body.question || '').trim();
  if (!question) return res.status(400).json({ error: 'Please type a question.' });
  if (question.length > 2000) return res.status(400).json({ error: 'Question is too long (max 2000 characters).' });

  try {
    const doc = await loadDoc(Number(req.params.id), req.user.id);
    if (!doc) return res.status(404).json({ error: 'PDF not found.' });

    let pdfBase64;
    try {
      pdfBase64 = (await readPdf(doc)).toString('base64');
    } catch {
      return res.status(410).json({ error: 'The file is missing on the server. Please upload it again.' });
    }

    const [previous] = await pool.query(
      'SELECT question, answer FROM doc_chats WHERE document_id = ? ORDER BY created_at DESC, id DESC LIMIT 4',
      [doc.id]
    );

    // Pehle PDF, phir purani baat-cheet, phir naya sawaal
    const contents = [
      { role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }, { text: `These are my study notes: "${doc.name}".` }] },
      { role: 'model', parts: [{ text: 'I have read your notes. Ask me anything about them.' }] },
    ];
    previous.reverse().forEach((c) => {
      contents.push({ role: 'user', parts: [{ text: c.question }] });
      contents.push({ role: 'model', parts: [{ text: c.answer }] });
    });
    contents.push({ role: 'user', parts: [{ text: question }] });

    const lang = await getUserLanguage(req.user.id);
    const { text: answer, model } = await generateAnswer({
      contents,
      systemInstruction: `You are StudyMate AI, helping a college student study from their own PDF notes.
- Base your answer on the PDF. When useful, mention the page or section it comes from.
- If the answer is not in the PDF, say so clearly, then give a short general explanation marked as "Outside your notes".
- Use markdown (headings, lists, tables, code blocks) to keep answers easy to revise from.
- Language: ${languageRule(lang)}`,
    });

    if (!answer) return res.status(502).json({ error: 'AI did not return an answer. Please try again.' });

    const [result] = await pool.query(
      'INSERT INTO doc_chats (document_id, user_id, question, answer) VALUES (?, ?, ?, ?)',
      [doc.id, req.user.id, question, answer]
    );
    res.json({ id: result.insertId, question, answer, model });
  } catch (err) {
    console.error('Doc ask error:', err.message);
    res.status(500).json({ error: 'The AI could not read this PDF right now. Please try again.' });
  }
});

module.exports = router;
