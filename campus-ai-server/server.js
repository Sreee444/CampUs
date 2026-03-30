require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const chatRoute = require('./routes/chat');
const extractEventRoute = require('./routes/extractEvent');
const extractPosterRoute = require('./routes/extractPoster');

const REQUIRED_ENV_VARS = ['GROQ_API_KEY', 'SUPABASE_URL', 'SUPABASE_KEY'];
const app = express();
const PORT = Number(process.env.PORT) || 5000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function logMissingEnvVariables() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`[startup] Missing environment variables: ${missing.join(', ')}`);
    console.error('[startup] Add them in Render Environment settings before using related endpoints.');
  }
}

app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((value) => value.trim())
      : '*',
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startedAt;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

app.get('/', (_req, res) => {
  res.status(200).send('AI backend running 🚀');
});

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Required primary routes
app.use('/extractEvent', extractEventRoute);
app.use('/extractPoster', extractPosterRoute);
app.use('/chat', chatRoute);

// Backward-compatible aliases for existing clients
app.use('/ai/extract-event', extractEventRoute);
app.use('/ai/extract-poster', extractPosterRoute);
app.use('/ai/chat', chatRoute);

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  console.error('[unhandled-error]', err?.stack || err?.message || err);
  res.status(500).json({
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'production' ? undefined : err?.message || 'Unknown error',
  });
});

logMissingEnvVariables();

app.listen(PORT, () => {
  console.log(`[startup] campus-ai-server running on port ${PORT}`);
  console.log(`[startup] environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandled-rejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaught-exception]', error);
});
