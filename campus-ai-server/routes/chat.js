const express = require('express');
const router = express.Router();
const { getChatCompletion } = require('../services/groqService');

const CAMPUS_AI_SYSTEM_PROMPT = `You are CampUs AI, a friendly and knowledgeable campus assistant built into the CampUs app.
You help students with:
- General academic questions (study tips, subject help, career advice)
- Campus life advice (time management, networking, joining clubs)
- General knowledge and factual questions
- Coding, tech, and project guidance
- Any other questions students might have

Keep answers concise, helpful, and encouraging. Format responses clearly.
If asked about specific campus events, projects, or schedules, let the student know they can browse the Events and Projects sections in the app for live data.`;

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const reply = await getChatCompletion(message.trim(), CAMPUS_AI_SYSTEM_PROMPT);

    if (!reply) {
      return res.status(500).json({ error: 'Empty response from AI' });
    }

    res.json({ reply });
  } catch (error) {
    console.error('[chat route]', error?.message || error);
    res.status(500).json({ error: error?.message || 'AI chat request failed' });
  }
});

module.exports = router;
