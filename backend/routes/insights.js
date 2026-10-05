// =========================================================
// Smart revision suggestions
//   GET  /api/insights       -> rule-based recommendations
//   POST /api/insights/plan  -> Gemini se 3-day study plan
// =========================================================
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const { generateAnswer } = require('../gemini');
const { languageRule, getUserLanguage } = require('../helpers');

const router = express.Router();
const DAY = 86400000;

// Har subject ka data: kitne sawaal, kitne quiz, average score, last activity
async function subjectStats(userId) {
  const [subjects] = await pool.query('SELECT id, name FROM subjects ORDER BY id');
  const [chats] = await pool.query(
    'SELECT subject_id, COUNT(*) AS n, MAX(created_at) AS last FROM chats WHERE user_id = ? GROUP BY subject_id',
    [userId]
  );
  const [quizzes] = await pool.query(
    `SELECT subject_id, COUNT(*) AS n, AVG(score / total * 100) AS avg, MAX(completed_at) AS last
     FROM quizzes WHERE user_id = ? AND completed_at IS NOT NULL GROUP BY subject_id`,
    [userId]
  );
  const [weakTopics] = await pool.query(
    `SELECT q.topic, q.subject_id, COALESCE(s.name, 'General') AS subject, ROUND(AVG(q.score / q.total * 100)) AS avg
     FROM quizzes q LEFT JOIN subjects s ON s.id = q.subject_id
     WHERE q.user_id = ? AND q.completed_at IS NOT NULL AND q.topic IS NOT NULL AND q.topic <> ''
     GROUP BY q.topic, q.subject_id, s.name
     HAVING avg < 60 ORDER BY avg ASC LIMIT 3`,
    [userId]
  );

  const stats = subjects.map((s) => {
    const c = chats.find((x) => x.subject_id === s.id);
    const q = quizzes.find((x) => x.subject_id === s.id);
    const lastDates = [c && c.last, q && q.last].filter(Boolean).map((d) => new Date(d).getTime());
    return {
      subjectId: s.id,
      subject: s.name,
      questions: c ? Number(c.n) : 0,
      quizzes: q ? Number(q.n) : 0,
      avgScore: q ? Math.round(Number(q.avg)) : null,
      daysSince: lastDates.length ? Math.floor((Date.now() - Math.max(...lastDates)) / DAY) : null,
    };
  });
  return { stats, weakTopics: weakTopics.map((t) => ({ ...t, avg: Number(t.avg) })) };
}

function buildRecommendations(stats, weakTopics) {
  const recs = [];
  const quizLink = (s, difficulty, topic = '') =>
    `quiz.html?subject=${s.subjectId}&difficulty=${difficulty}${topic ? `&topic=${encodeURIComponent(topic)}` : ''}`;
  const chatLink = (s, q) => `chat.html?subject=${s.subjectId}&q=${encodeURIComponent(q)}`;

  stats.forEach((s) => {
    if (s.avgScore !== null && s.avgScore < 60) {
      recs.push({ type: 'weak', priority: 1, subjectId: s.subjectId, subject: s.subject,
        title: `Revise ${s.subject}`,
        reason: `Your quiz average is ${s.avgScore}% across ${s.quizzes} quiz${s.quizzes > 1 ? 'zes' : ''}.`,
        action: { label: 'Take an easy quiz', href: quizLink(s, 'easy') } });
    } else if (s.quizzes === 0 && s.questions >= 3) {
      recs.push({ type: 'test', priority: 2, subjectId: s.subjectId, subject: s.subject,
        title: `Test yourself in ${s.subject}`,
        reason: `You asked ${s.questions} questions here but have not taken a quiz yet.`,
        action: { label: 'Start a quiz', href: quizLink(s, 'medium') } });
    } else if (s.daysSince !== null && s.daysSince >= 7 && s.questions + s.quizzes >= 2) {
      recs.push({ type: 'stale', priority: 3, subjectId: s.subjectId, subject: s.subject,
        title: `Revisit ${s.subject}`,
        reason: `Last studied ${s.daysSince} days ago. A quick quiz keeps it fresh.`,
        action: { label: 'Quick revision quiz', href: quizLink(s, 'medium') } });
    } else if (s.avgScore !== null && s.avgScore >= 80) {
      recs.push({ type: 'strong', priority: 4, subjectId: s.subjectId, subject: s.subject,
        title: `Level up in ${s.subject}`,
        reason: `Average ${s.avgScore}%. You are ready for harder questions.`,
        action: { label: 'Try a hard quiz', href: quizLink(s, 'hard') } });
    }
  });

  weakTopics.forEach((t) => {
    const s = { subjectId: t.subject_id || 1 };
    recs.push({ type: 'topic', priority: 1.5, subjectId: s.subjectId, subject: t.subject,
      title: `Weak spot: ${t.topic}`,
      reason: `You scored ${t.avg}% on ${t.subject} quizzes about this topic.`,
      action: { label: 'Explain it from basics', href: chatLink(s, `Explain ${t.topic} from the basics with simple examples`) } });
  });

  const fresh = stats.find((s) => s.subject !== 'General' && s.questions === 0 && s.quizzes === 0);
  if (fresh) {
    recs.push({ type: 'new', priority: 5, subjectId: fresh.subjectId, subject: fresh.subject,
      title: `Start ${fresh.subject}`,
      reason: 'You have not explored this subject yet.',
      action: { label: 'Ask a first question', href: `chat.html?subject=${fresh.subjectId}` } });
  }

  return recs.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

// GET /api/insights
router.get('/', auth, async (req, res) => {
  try {
    const { stats, weakTopics } = await subjectStats(req.user.id);
    res.json({ recommendations: buildRecommendations(stats, weakTopics), subjects: stats });
  } catch (err) {
    console.error('Insights error:', err.message);
    res.status(500).json({ error: 'Could not load recommendations.' });
  }
});

// POST /api/insights/plan -> AI ka personal 3-day revision plan
router.post('/plan', auth, async (req, res) => {
  try {
    const { stats, weakTopics } = await subjectStats(req.user.id);
    const lines = stats
      .filter((s) => s.questions || s.quizzes)
      .map((s) => `- ${s.subject}: ${s.questions} questions asked, ${s.quizzes} quizzes, average score ${s.avgScore ?? 'n/a'}%, last studied ${s.daysSince ?? 'never'} days ago`);
    const weak = weakTopics.map((t) => `- ${t.topic} (${t.subject}): ${t.avg}%`);

    const prompt = `Here is a college student's study data:
${lines.length ? lines.join('\n') : '- No activity yet.'}
${weak.length ? `Weak topics:\n${weak.join('\n')}` : ''}

Create a short, practical 3-day revision plan. Use a heading for each day with 2 to 3 bullet tasks.
Focus first on weak subjects and topics, then on subjects not studied recently. Keep it under 180 words. End with one line of encouragement.`;

    const { text } = await generateAnswer({
      contents: prompt,
      systemInstruction: `You are StudyMate AI, a friendly study coach. ${languageRule(await getUserLanguage(req.user.id))}`,
    });
    res.json({ plan: text });
  } catch (err) {
    console.error('Plan error:', err.message);
    res.status(500).json({ error: 'Could not create a study plan right now.' });
  }
});

module.exports = router;
