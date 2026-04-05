const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { extractTextFromImage } = require('../services/ocrService');
const { extractQrUrlFromImage } = require('../services/qrService');
const { getGroqCompletion } = require('../services/groqService');
const { parseAiJson } = require('../utils/jsonParser');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg');
    cb(null, `poster-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function buildPrompt(posterText, qrUrl = '') {
  return `Extract complete fest and event information from this poster text.

Rules:
- Return ONLY valid JSON (no markdown, no commentary).
- Prefer exact values from text. If unknown, use empty string.
- If the poster is for a standalone event, keep festName empty and set events[0].title to the real event title.
- Do not force a festName from taglines or headers when there is only one event.
- Normalize dates as YYYY-MM-DD whenever possible.
- If date is a range, use eventStartDate and eventEndDate.
- If only one date is found, set both start and end to that date.
- Extract eventStartDateTime when both date and time are visible.
- Also extract eventStartTime in HH:mm format when time is visible.
- IMPORTANT: Extract fest-level dates (festStartDate, festEndDate) from overall fest duration.
- IMPORTANT: Extract college location (city/state/country) if mentioned anywhere.
- Extract event-level dates for each individual event within the fest.
- Set eventType to one of: hackathon, workshop, competition, quiz, gaming, robotics, coding, talk, expo, technical, cultural, sports, other.
- Set participationType strictly as individual or team.
- Extract minTeamSize and maxTeamSize from labels like "team members 3-4" or "team size 2-5".
- If a QR code is visibly used for registration but the actual URL is not readable from text, leave registrationLink empty and set hasRegistrationQr to true.
- If QR URL hint is present below, use it as registrationLink unless text clearly indicates a different official registration URL.
- Extract registrationFee if printed as text like "Registration Fee 250".
- Extract eventLink only when an actual URL is visible in text. Do not invent one.

Return JSON format:

{
  "festName": "[Fest name or event series name]",
  "collegeName": "[College/University name]",
  "collegeLocation": "[City, State or location of college]",
  "collegeWebsite": "[College website URL if found]",
  "festStartDate": "[YYYY-MM-DD format - first day of fest]",
  "festEndDate": "[YYYY-MM-DD format - last day of fest]",
  "events": [
    {
      "title": "[Event name]",
      "description": "[Event description]",
      "eventType": "[hackathon/workshop/competition/quiz/gaming/robotics/coding/talk/expo/technical/cultural/sports/other]",
      "eventStartDateTime": "[ISO datetime or readable datetime if exact time available]",
      "eventStartDate": "[YYYY-MM-DD]",
      "eventStartTime": "[HH:mm]",
      "eventEndDate": "[YYYY-MM-DD]",
      "venue": "[Event location/hall name]",
      "participationType": "[individual or team]",
      "minTeamSize": "[number if team event]",
      "maxTeamSize": "[number if team event]",
      "registrationLink": "[Registration URL if found]",
      "registrationQrLink": "[QR target URL if text exposes it, else empty]",
      "eventLink": "[Event URL if printed, else empty]",
      "registrationFee": "[numeric fee if visible, else empty]",
      "hasRegistrationQr": false
    }
  ]
}

Only return valid JSON.

QR URL hint (if decoded): ${qrUrl || '[none]'}

Poster text:
${posterText}`;
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function parseDateToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return '';

  const dmY = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmY) {
    const dd = dmY[1].padStart(2, '0');
    const mm = dmY[2].padStart(2, '0');
    const yyyy = dmY[3].length === 2 ? `20${dmY[3]}` : dmY[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const normalized = normalizeDateTimeText(raw);
  const monthDay = normalized.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(20\d{2}))?/i);
  if (monthDay) {
    const year = Number(monthDay[3] || new Date().getFullYear());
    const parsed = new Date(`${monthDay[1]} ${monthDay[2]}, ${year}`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);

  return '';
}

function normalizeDateTimeText(value) {
  return String(value || '')
    .replace(/\|/g, ' ')
    .replace(/(\d)(AM|PM)\b/gi, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTimeOnly(value) {
  const raw = normalizeDateTimeText(value);
  if (!raw) return '';

  const ampmMatch = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\b/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = Number(ampmMatch[2] || '00');
    const meridiem = ampmMatch[3].toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  const hhmmMatch = raw.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhmmMatch) {
    return `${String(Number(hhmmMatch[1])).padStart(2, '0')}:${hhmmMatch[2]}`;
  }

  return '';
}

function normalizeEventType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (/hack/.test(raw)) return 'hackathon';
  if (/workshop|bootcamp|masterclass/.test(raw)) return 'workshop';
  if (/competition|contest|challenge/.test(raw)) return 'competition';
  if (/quiz/.test(raw)) return 'quiz';
  if (/game|gaming|esport/.test(raw)) return 'gaming';
  if (/robot/.test(raw)) return 'robotics';
  if (/coding|code/.test(raw)) return 'coding';
  if (/talk|seminar|session|lecture/.test(raw)) return 'talk';
  if (/expo|exhibition/.test(raw)) return 'expo';
  if (/technical|tech/.test(raw)) return 'technical';
  if (/cultural|arts?|music|dance|drama/.test(raw)) return 'cultural';
  if (/sports?|athletic/.test(raw)) return 'sports';
  return 'other';
}

function cleanPosterLine(line) {
  return String(line || '')
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isInstitutionOrMetaLine(line) {
  const text = cleanPosterLine(line).toLowerCase();
  if (!text) return true;

  return /\b(autonomous|department|dept\.?|college|university|institute|school|society|of india|prof\.?|assistant professor|students?|s\d|cse|ece|civil|mechanical|computer science)\b/.test(text.replace(/\n/g, ' '))
    || /\b(date|time|venue|register|registration|fee|scan|qr|contact)\b/.test(text)
    || /^https?:\/\//.test(text)
    || /^www\./.test(text);
}

function hasEventKeyword(line) {
  return /\b(workshop|seminar|talk|webinar|hackathon|competition|contest|bootcamp|summit|lecture|session|expo|event)\b/i.test(line);
}

function buildFallbackTitle(lines) {
  const cleaned = lines.map(cleanPosterLine).filter(Boolean);

  for (let i = 0; i < cleaned.length; i += 1) {
    const current = cleaned[i];
    const next = cleaned[i + 1] || '';
    const next2 = cleaned[i + 2] || '';

    if (!hasEventKeyword(current) && !hasEventKeyword(`${current} ${next}`)) continue;

    const parts = [current];
    if (next && (!isInstitutionOrMetaLine(next) || /^on\b/i.test(next))) parts.push(next);
    if (next2 && /^on\b/i.test(next2)) parts.push(next2);

    const candidate = cleanPosterLine(parts.join(' '));
    if (candidate.length >= 6 && candidate.length <= 120) {
      return candidate;
    }
  }

  const fallback = cleaned.find((line) => !isInstitutionOrMetaLine(line) && line.length >= 6 && line.length <= 80);
  return fallback || '';
}

function buildFallbackDescription(lines, title) {
  const titleLower = cleanPosterLine(title).toLowerCase();
  const descriptionLines = lines
    .map(cleanPosterLine)
    .filter(Boolean)
    .filter((line) => line.toLowerCase() !== titleLower)
    .filter((line) => !isInstitutionOrMetaLine(line))
    .slice(0, 3);

  return descriptionLines.join(' ').slice(0, 240);
}

function fallbackFromPosterText(posterText) {
  const text = normalizeWhitespace(posterText);
  if (!text) {
    return {
      fallbackTitle: '',
      fallbackDescription: '',
      fallbackVenue: '',
      fallbackCollege: '',
      fallbackLocation: '',
      fallbackRegistration: '',
      fallbackRegistrationQr: '',
      fallbackHasRegistrationQr: false,
      fallbackStartDate: '',
      fallbackEndDate: '',
      fallbackStartTime: '',
      fallbackStartDateTime: '',
      fallbackParticipationType: '',
      fallbackMinTeam: '',
      fallbackMaxTeam: '',
      fallbackEventType: '',
      fallbackEventLink: '',
      fallbackRegistrationFee: '',
    };
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const lower = text.toLowerCase();

  const explicitUrlMatches = text.match(/https?:\/\/[^\s)\]>"']+/gi) || [];
  const bareDomainMatches = text.match(/\b(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[a-z0-9._~:/?#[\]@!$&'()*+,;=%-]*)?/gi) || [];
  const allUrls = Array.from(new Set([...explicitUrlMatches, ...bareDomainMatches]))
    .map((url) => String(url || '').replace(/[),.;]+$/, '').trim())
    .map((url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`));

  const fallbackRegistration =
    allUrls.find((url) => /register|registration|form|forms|signup|apply|ticket|book|qr/i.test(url)) ||
    allUrls[0] ||
    '';
  const fallbackEventLink = allUrls.find((item) => item !== fallbackRegistration) || '';

  const explicitMonthDate = text.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?/i);

  const dateMatches = text.match(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g) || [];
  const parsedMonthDate = explicitMonthDate ? parseDateToken(explicitMonthDate[0]) : '';
  let isoDates = [parsedMonthDate, ...dateMatches.map(parseDateToken)].filter(Boolean);

  const currentYear = new Date().getFullYear();
  isoDates = isoDates.map((iso) => {
    const year = Number(String(iso).slice(0, 4));
    if (!year) return iso;
    if (year < currentYear - 1 && explicitMonthDate) {
      return `${currentYear}${String(iso).slice(4)}`;
    }
    return iso;
  });

  const fallbackStartDate = isoDates[0] || parseDateToken(text) || '';
  const fallbackEndDate = isoDates[1] || isoDates[0] || '';

  const timeRangeMatch = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\s*(?:-|to)\s*(\d{1,2}(?::\d{2})?\s*(?:AM|PM))\b/i);
  const fallbackStartTime = timeRangeMatch ? toTimeOnly(timeRangeMatch[1]) : toTimeOnly(text);
  const fallbackStartDateTime = fallbackStartDate && fallbackStartTime ? `${fallbackStartDate}T${fallbackStartTime}:00` : '';

  const collegeLine =
    lines.find((l) => /(college|university|institute|school of)/i.test(l)) || '';
  const presentingOrg =
    lines.find((l) => /^[A-Za-z0-9& .'-]{2,30}\s+PRESENTS$/i.test(l)) || '';
  const fallbackCollege = collegeLine || presentingOrg.replace(/\s+PRESENTS$/i, '').trim();

  const locationLine =
    lines.find((l) => /(venue|location|campus|hall|auditorium|block|ground)/i.test(l)) || '';
  const fallbackVenue = locationLine.replace(/^.*?(venue|location)\s*[:\-]\s*/i, '').trim() || locationLine;

  const teamRange = text.match(/\b(?:team size|team members|team|members)\s*[:\-]?\s*(\d+)\s*(?:to|\-|–)\s*(\d+)\b/i);
  const compactTeamRange = text.match(/\b(\d+)\s*(?:to|\-|–)\s*(\d+)\s*(?:members|member|team)\b/i);
  const fallbackMinTeam = teamRange ? String(teamRange[1]) : '';
  const fallbackMaxTeam = teamRange ? String(teamRange[2]) : '';
  const normalizedMinTeam = fallbackMinTeam || (compactTeamRange ? String(compactTeamRange[1]) : '');
  const normalizedMaxTeam = fallbackMaxTeam || (compactTeamRange ? String(compactTeamRange[2]) : '');
  const fallbackParticipationType = /team|squad|group|members?\s*\d+/i.test(lower) ? 'team' : '';
  const fallbackEventType = normalizeEventType(text);

  const registrationFeeMatch = text.match(/\bregistration\s*fee\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*(\d+)\b/i);
  const fallbackRegistrationFee = registrationFeeMatch ? registrationFeeMatch[1] : '';
  const fallbackHasRegistrationQr = /\b(register now|scan|qr)\b/i.test(lower);

  // Build a cleaner title/description from OCR text while avoiding institution/meta lines.
  const fallbackTitle = buildFallbackTitle(lines);
  const fallbackDescription = buildFallbackDescription(lines, fallbackTitle);

  // Basic location fallback from "City, State" style line.
  const fallbackLocation =
    lines.find((l) => /^[A-Za-z .'-]+,\s*[A-Za-z .'-]+$/.test(l)) || '';

  return {
    fallbackTitle,
    fallbackDescription,
    fallbackVenue,
    fallbackCollege,
    fallbackLocation,
    fallbackRegistration,
    fallbackRegistrationQr: '',
    fallbackHasRegistrationQr,
    fallbackStartDate,
    fallbackEndDate,
    fallbackStartTime,
    fallbackStartDateTime,
    fallbackParticipationType,
    fallbackMinTeam: normalizedMinTeam,
    fallbackMaxTeam: normalizedMaxTeam,
    fallbackEventType,
    fallbackEventLink,
    fallbackRegistrationFee,
  };
}

function normalizeExtractResult(parsed, posterText = '', qrUrl = '') {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const rawEvents = Array.isArray(source.events) ? source.events : [];
  const fallback = fallbackFromPosterText(posterText);

  const events = rawEvents.map((event) => ({
    title: firstNonEmpty(event?.title, event?.event_title, fallback.fallbackTitle),
    description: firstNonEmpty(event?.description, event?.event_description, fallback.fallbackDescription),
    eventType: firstNonEmpty(event?.eventType, event?.event_type, fallback.fallbackEventType),
    eventStartDateTime: firstNonEmpty(event?.eventStartDateTime, event?.event_start_datetime, fallback.fallbackStartDateTime),
    eventStartDate: firstNonEmpty(event?.eventStartDate, event?.event_start_date, event?.date, fallback.fallbackStartDate),
    eventStartTime: firstNonEmpty(event?.eventStartTime, event?.event_start_time, fallback.fallbackStartTime),
    eventEndDate: firstNonEmpty(event?.eventEndDate, event?.event_end_date, event?.date, fallback.fallbackEndDate),
    venue: firstNonEmpty(event?.venue, fallback.fallbackVenue),
    participationType: firstNonEmpty(event?.participationType, event?.participation_type, fallback.fallbackParticipationType),
    minTeamSize: firstNonEmpty(String(event?.minTeamSize || ''), String(event?.min_team_size || ''), fallback.fallbackMinTeam),
    maxTeamSize: firstNonEmpty(String(event?.maxTeamSize || ''), String(event?.max_team_size || ''), fallback.fallbackMaxTeam),
    registrationLink: firstNonEmpty(event?.registrationLink, event?.registration_link, qrUrl, fallback.fallbackRegistration),
    registrationQrLink: firstNonEmpty(event?.registrationQrLink, event?.registration_qr_link, qrUrl, fallback.fallbackRegistrationQr),
    eventLink: firstNonEmpty(event?.eventLink, event?.event_link, fallback.fallbackEventLink),
    registrationFee: firstNonEmpty(String(event?.registrationFee || ''), String(event?.registration_fee || ''), fallback.fallbackRegistrationFee),
    hasRegistrationQr: event?.hasRegistrationQr === true || fallback.fallbackHasRegistrationQr,
    bannerImage: firstNonEmpty(event?.bannerImage, event?.banner_image),
    posterImage: firstNonEmpty(event?.posterImage, event?.poster_image),
  }));

  if (!events.length) {
    events.push({
      title: fallback.fallbackTitle,
      description: fallback.fallbackDescription,
      eventType: fallback.fallbackEventType,
      eventStartDateTime: fallback.fallbackStartDateTime,
      eventStartDate: fallback.fallbackStartDate,
      eventStartTime: fallback.fallbackStartTime,
      eventEndDate: fallback.fallbackEndDate,
      venue: fallback.fallbackVenue,
      participationType: fallback.fallbackParticipationType,
      minTeamSize: fallback.fallbackMinTeam,
      maxTeamSize: fallback.fallbackMaxTeam,
      registrationLink: qrUrl || fallback.fallbackRegistration,
      registrationQrLink: qrUrl || fallback.fallbackRegistrationQr,
      eventLink: fallback.fallbackEventLink,
      registrationFee: fallback.fallbackRegistrationFee,
      hasRegistrationQr: fallback.fallbackHasRegistrationQr,
      bannerImage: '',
      posterImage: '',
    });
  }

  const firstEvent = events[0] || {};
  const rawFestName = firstNonEmpty(source.festName, source.fest_name);
  const isLikelyStandalone = events.length <= 1;
  const festName = isLikelyStandalone ? '' : rawFestName;

  return {
    festName,
    collegeName: firstNonEmpty(source.collegeName, source.college_name, fallback.fallbackCollege),
    collegeLocation: firstNonEmpty(source.collegeLocation, source.college_location, fallback.fallbackLocation),
    collegeWebsite: firstNonEmpty(source.collegeWebsite, source.college_website),
    festStartDate: isLikelyStandalone ? '' : firstNonEmpty(source.festStartDate, source.fest_start_date),
    festEndDate: isLikelyStandalone ? '' : firstNonEmpty(source.festEndDate, source.fest_end_date),
    events,

    // Backward-compatible top-level event fields for existing single-event clients.
    title: firstNonEmpty(firstEvent.title, source.title, source.event_title),
    event_title: firstNonEmpty(firstEvent.title, source.event_title, source.title),
    description: firstNonEmpty(firstEvent.description, source.description, source.event_description),
    event_description: firstNonEmpty(firstEvent.description, source.event_description, source.description),
    college_name: firstNonEmpty(source.college_name, source.collegeName),
    college_location: firstNonEmpty(source.college_location, source.collegeLocation),
    event_start_datetime: firstNonEmpty(source.event_start_datetime, source.eventStartDateTime, firstEvent.eventStartDateTime, fallback.fallbackStartDateTime),
    event_start_date: firstNonEmpty(source.event_start_date, source.eventStartDate, firstEvent.eventStartDate),
    event_start_time: firstNonEmpty(source.event_start_time, source.eventStartTime, firstEvent.eventStartTime, fallback.fallbackStartTime),
    event_end_date: firstNonEmpty(source.event_end_date, source.eventEndDate, firstEvent.eventEndDate),
    venue: firstNonEmpty(source.venue, firstEvent.venue),
    participation_type: firstNonEmpty(source.participation_type, source.participationType, firstEvent.participationType),
    min_team_size: firstNonEmpty(String(source.min_team_size || ''), String(source.minTeamSize || ''), firstEvent.minTeamSize),
    max_team_size: firstNonEmpty(String(source.max_team_size || ''), String(source.maxTeamSize || ''), firstEvent.maxTeamSize),
    registration_link: firstNonEmpty(source.registration_link, source.registrationLink, firstEvent.registrationLink, qrUrl, fallback.fallbackRegistration),
    registration_qr_link: firstNonEmpty(source.registration_qr_link, source.registrationQrLink, firstEvent.registrationQrLink, qrUrl, fallback.fallbackRegistrationQr),
    has_registration_qr: source.has_registration_qr === true || source.hasRegistrationQr === true || firstEvent.hasRegistrationQr === true || fallback.fallbackHasRegistrationQr,
    event_link: firstNonEmpty(source.event_link, source.eventLink, firstEvent.eventLink, fallback.fallbackEventLink),
    event_type: firstNonEmpty(source.event_type, source.eventType, firstEvent.eventType, fallback.fallbackEventType),
    registration_fee: firstNonEmpty(String(source.registration_fee || ''), String(source.registrationFee || ''), firstEvent.registrationFee, fallback.fallbackRegistrationFee),
    banner_image: firstNonEmpty(source.banner_image, source.bannerImage, firstEvent.bannerImage),
    poster_image: firstNonEmpty(source.poster_image, source.posterImage, firstEvent.posterImage),
  };
}

router.post('/', upload.any(), async (req, res) => {
  const firstFile = Array.isArray(req.files) ? req.files[0] : null;
  const filePath = firstFile?.path;
  try {
    console.log('[AI API] /ai/extract-poster request', {
      hasFile: !!firstFile,
      fieldname: firstFile?.fieldname,
      originalname: firstFile?.originalname,
    });
    if (!firstFile) {
      return res.status(400).json({ error: 'Image file is required (field name: image or poster)' });
    }

    const posterText = await extractTextFromImage(filePath);
    const qrUrl = await extractQrUrlFromImage(filePath).catch(() => '');
    if (!posterText) {
      return res.status(422).json({ error: 'Could not extract text from poster image' });
    }

    const prompt = buildPrompt(posterText, qrUrl);
    const aiText = await getGroqCompletion(prompt);
    const parsed = parseAiJson(aiText);
    const normalized = normalizeExtractResult(parsed, posterText, qrUrl);
    console.log('[AI API] /ai/extract-poster success', {
      festName: normalized?.festName || null,
      collegeName: normalized?.collegeName || null,
      collegeLocation: normalized?.collegeLocation || null,
      festStartDate: normalized?.festStartDate || null,
      festEndDate: normalized?.festEndDate || null,
      title: normalized?.title || null,
      eventStartDate: normalized?.event_start_date || null,
      eventStartTime: normalized?.event_start_time || null,
      venue: normalized?.venue || null,
      registrationLink: normalized?.registration_link || null,
      qrUrl: qrUrl || null,
      eventCount: Array.isArray(normalized?.events) ? normalized.events.length : 0,
    });

    return res.json(normalized);
  } catch (error) {
    console.error('[extract-poster]', error);
    return res.status(500).json({
      error: 'Failed to extract event from poster',
      details: error?.message || 'Unknown error',
    });
  } finally {
    if (filePath) {
      fs.promises.unlink(filePath).catch(() => {});
    }
  }
});

module.exports = router;
