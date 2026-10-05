// Gemini AI helper: retry + backup model, taaki "high demand" error par app fail na ho
const { GoogleGenAI } = require('@google/genai');

let ai = null;
function getClient() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return ai;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 503 (server busy) ya 429 (limit) wale errors par retry karna hai
function isBusyError(err) {
  const msg = String((err && err.message) || '');
  return err?.status === 503 || err?.status === 429 ||
    /503|429|UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|overloaded/i.test(msg);
}

async function generateAnswer({ contents, systemInstruction, config = {} }) {
  const models = [
    process.env.GEMINI_MODEL || 'gemini-flash-latest',            // main model
    process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest', // backup model
  ];

  let lastError;
  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await getClient().models.generateContent({
          model,
          contents,
          config: { ...config, ...(systemInstruction ? { systemInstruction } : {}) },
        });
        return { text: (response.text || '').trim(), model };
      } catch (err) {
        lastError = err;
        if (!isBusyError(err)) throw err; // koi aur error hai to retry ka fayda nahi
        console.warn(`[Gemini] ${model} busy (try ${attempt}), retrying...`);
        await sleep(1500 * attempt);
      }
    }
  }
  throw lastError;
}

module.exports = { generateAnswer };
