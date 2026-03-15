require('dotenv').config();

const express = require('express');
const cors = require('cors');

const chatRoute = require('./routes/chat');
const extractEventRoute = require('./routes/extractEvent');
const extractPosterRoute = require('./routes/extractPoster');

const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

app.use('/ai/extract-event', extractEventRoute);
app.use('/ai/extract-poster', extractPosterRoute);
app.use('/ai/chat', chatRoute);

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  console.error('[unhandled-error]', err);
  res.status(500).json({
    error: 'Internal server error',
    details: err?.message || 'Unknown error',
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`campus-ai-server running on port ${PORT}`);
});
