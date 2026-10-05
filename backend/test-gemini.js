// Sirf ye check karne ke liye ki Gemini API key kaam kar rahi hai
// Chalane ke liye:  node test-gemini.js
require('dotenv').config();
const { generateAnswer } = require('./gemini');

(async () => {
  try {
    const { text, model } = await generateAnswer({
      contents: 'Explain what a database is in one sentence.',
    });
    console.log(`Gemini is working! (model: ${model})\n`);
    console.log(text);
  } catch (err) {
    console.error('Gemini error:', err.message);
  }
})();
