function sanitizeRawText(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();
}

function findBalancedObjectCandidates(text) {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start !== -1) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  return candidates;
}

function parseAiJson(raw) {
  const cleaned = sanitizeRawText(raw);
  if (!cleaned) throw new Error('AI response is empty');

  // 1) Fast path: response is already pure JSON.
  try {
    return JSON.parse(cleaned);
  } catch (_) {}

  // 2) Fallback: extract balanced JSON object(s) from mixed text.
  const candidates = findBalancedObjectCandidates(cleaned);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (_) {}
  }

  throw new Error('Failed to parse JSON from AI response');
}

module.exports = {
  parseAiJson,
};
