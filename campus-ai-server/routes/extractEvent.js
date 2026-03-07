const express = require('express');
const { scrapeWebsiteText } = require('../services/scraperService');
const { getGroqCompletion } = require('../services/groqService');
const { parseAiJson } = require('../utils/jsonParser');

const router = express.Router();

function buildPrompt(websiteText) {
  return `Extract complete fest and event information from this website text.

Rules:
- Return ONLY valid JSON (no markdown, no commentary).
- Prefer exact values from text. If unknown, use empty string.
- If the page is a standalone event page (not a fest with multiple events), keep festName as empty string.
- In that case, put the actual event name in events[0].title.
- Classify eventType as one of: hackathon, workshop, competition, quiz, gaming, robotics, coding, talk, expo, technical, cultural, sports, other.
- Set participationType strictly as: individual or team.
- Extract eventStartDateTime with date + time when available (ISO preferred, e.g. 2026-02-25T09:30:00+05:30).
- eventStartDate should still be present as YYYY-MM-DD (derive from eventStartDateTime if needed).
- Also provide eventStartTime in HH:mm format when available.
- eventEndDate is optional. Keep empty if not available.
- IMPORTANT: Extract fest-level dates (festStartDate, festEndDate) from overall fest duration.
- IMPORTANT: Extract college location (city/state/country) if mentioned anywhere.
- Registration link rules:
  - Use explicit registration/form URL when present.
  - If only QR candidate URL exists, put that URL in registrationLink.
  - Also set registrationQrLink when QR-like link is present.
- For images, use IMAGE_LINKS to fill posterImage or bannerImage with a direct image URL.
- Use the provided REGISTRATION_LINKS and QR_CANDIDATE_LINKS sections from page context.

Return JSON format:

{
  "festName": "[Fest name or event series name]",
  "collegeName": "[College/University name]",
  "collegeLocation": "[City, State or location of college]",
  "collegeWebsite": "[College website URL if found]",
  "festStartDate": "[YYYY-MM-DD format - first day of fest]",
  "festEndDate": "[YYYY-MM-DD format - last day of fest]",
  "sourceUrl": "",
  "events": [
    {
      "title": "[Event name]",
      "description": "[Event description]",
      "eventType": "[hackathon/workshop/competition/quiz/gaming/robotics/coding/talk/expo/technical/cultural/sports/other]",
      "eventStartDateTime": "[ISO datetime or readable datetime if exact time available]",
      "eventStartDate": "[YYYY-MM-DD]",
      "eventStartTime": "[HH:mm if available]",
      "eventEndDate": "[YYYY-MM-DD or empty]",
      "venue": "[Event location/hall name]",
      "participationType": "[individual or team]",
      "minTeamSize": "[number if team event]",
      "maxTeamSize": "[number if team event]",
      "registrationLink": "[Registration/form URL or QR target URL if available]",
      "registrationQrLink": "[QR target URL when identifiable, else empty]",
      "eventLink": "[specific event page URL when available]",
      "posterImage": "[direct poster image URL if available]",
      "bannerImage": "[direct banner image URL if available]"
    }
  ]
}

Only return valid JSON.

Website text:
${websiteText}`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeDateTimeText(value) {
  const monthPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  let text = String(value || '');
  if (!text) return '';

  text = text.replace(new RegExp(`([A-Za-z])(${monthPattern})`, 'g'), '$1 $2');
  text = text.replace(new RegExp(`((?:${monthPattern})\\s*[0-3]?\\d(?:st|nd|rd|th)?)([0-2]?\\d[:.]\\d{2}\s?(?:AM|PM|am|pm)?)`, 'g'), '$1 $2');
  text = text.replace(/(\d{1,2}[:.]\d{2}\s*)(AM|PM|am|pm)(?=[A-Za-z])/g, '$1$2 ');

  return text;
}

function to24HourTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const ampmMatch = raw.match(/\b(\d{1,2})[:.](\d{2})\s*(AM|PM)\b/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = Number(ampmMatch[2]);
    const meridiem = String(ampmMatch[3]).toUpperCase();
    if (meridiem === 'PM' && hour < 12) hour += 12;
    if (meridiem === 'AM' && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  const hhmmMatch = raw.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (hhmmMatch) {
    const hour = Number(hhmmMatch[1]);
    const minute = Number(hhmmMatch[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
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

function normalizeParticipationType(value, minTeamSize, maxTeamSize, title, description) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'individual' || raw === 'solo') return 'individual';
  if (raw === 'team' || raw === 'group') return 'team';

  const minNum = Number(minTeamSize || 0);
  const maxNum = Number(maxTeamSize || 0);
  if (Number.isFinite(minNum) && minNum > 1) return 'team';
  if (Number.isFinite(maxNum) && maxNum > 1) return 'team';

  const context = `${title || ''} ${description || ''}`.toLowerCase();
  if (/\b(team|teams|group|squad|duo|pair|members?)\b/.test(context)) return 'team';
  if (/\b(individual|solo)\b/.test(context)) return 'individual';
  return '';
}

function extractFallbackDateTime(websiteText) {
  const text = normalizeDateTimeText(String(websiteText || ''));
  const monthNames = '(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)';
  const dateMatch = text.match(/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/);
  const monthDayMatch = text.match(new RegExp(`${monthNames}\\s+(\\d{1,2})(?:st|nd|rd|th)?`, 'i'));
  const monthDayTimeMatch = text.match(new RegExp(`${monthNames}\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s*([0-2]?\\d[:.]\\d{2}\\s?(?:AM|PM|am|pm)?)`, 'i'));
  const timeMatch = text.match(/([0-2]?\d[:.]\d{2}\s?(?:AM|PM|am|pm)?)/i);

  let fallbackDate = dateMatch ? dateMatch[1] : '';
  let fallbackTime = timeMatch ? to24HourTime(timeMatch[1]) : '';

  if (!fallbackDate && monthDayTimeMatch) {
    const monthText = monthDayTimeMatch[1];
    const dayText = monthDayTimeMatch[2];
    const inferred = new Date(`${monthText} ${dayText}, ${new Date().getFullYear()}`);
    if (!Number.isNaN(inferred.getTime())) {
      fallbackDate = inferred.toISOString().slice(0, 10);
    }
    fallbackTime = to24HourTime(monthDayTimeMatch[3]) || fallbackTime;
  }

  if (!fallbackDate && monthDayMatch) {
    const monthText = monthDayMatch[1];
    const dayText = monthDayMatch[2];
    const inferred = new Date(`${monthText} ${dayText}, ${new Date().getFullYear()}`);
    if (!Number.isNaN(inferred.getTime())) {
      fallbackDate = inferred.toISOString().slice(0, 10);
    }
  }
  const fallbackDateTime = fallbackDate && fallbackTime ? `${fallbackDate} ${fallbackTime}` : '';

  return {
    fallbackDate,
    fallbackTime,
    fallbackDateTime,
  };
}

function parseIsoDateSafe(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function inferFestDatesFromText(websiteText) {
  const text = String(websiteText || '');
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const inferredYear = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
  const monthNames = '(Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)';

  // Example: "Feb 25-28 2026", "February 25 to 28"
  const sameMonthRange = text.match(new RegExp(`\\b${monthNames}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(20\\d{2}))?\\b`, 'i'));
  if (sameMonthRange) {
    const month = sameMonthRange[1];
    const startDay = Number(sameMonthRange[2]);
    const endDay = Number(sameMonthRange[3]);
    const year = Number(sameMonthRange[4] || inferredYear);
    const start = new Date(`${month} ${startDay}, ${year}`);
    const end = new Date(`${month} ${endDay}, ${year}`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
  }

  // Example: "25-28 Feb 2026"
  const dayMonthRange = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthNames}(?:\\s*,?\\s*(20\\d{2}))?\\b`, 'i'));
  if (dayMonthRange) {
    const startDay = Number(dayMonthRange[1]);
    const endDay = Number(dayMonthRange[2]);
    const month = dayMonthRange[3];
    const year = Number(dayMonthRange[4] || inferredYear);
    const start = new Date(`${month} ${startDay}, ${year}`);
    const end = new Date(`${month} ${endDay}, ${year}`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
  }

  // Example: "From 25 Feb 2026 to 28 Feb 2026"
  const fullRange = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthNames}\\s*(20\\d{2})\\s*(?:-|to)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+${monthNames}\\s*(20\\d{2})\\b`, 'i'));
  if (fullRange) {
    const startDay = Number(fullRange[1]);
    const startMonth = fullRange[2];
    const startYear = Number(fullRange[3]);
    const endDay = Number(fullRange[4]);
    const endMonth = fullRange[5];
    const endYear = Number(fullRange[6]);
    const start = new Date(`${startMonth} ${startDay}, ${startYear}`);
    const end = new Date(`${endMonth} ${endDay}, ${endYear}`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
  }

  // Fallback single date if only one date appears.
  const singleDate = text.match(new RegExp(`\\b${monthNames}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(20\\d{2}))?\\b`, 'i'));
  if (singleDate) {
    const month = singleDate[1];
    const day = Number(singleDate[2]);
    const year = Number(singleDate[3] || inferredYear);
    const dt = new Date(`${month} ${day}, ${year}`);
    if (!Number.isNaN(dt.getTime())) {
      const iso = dt.toISOString().slice(0, 10);
      return { start: iso, end: iso };
    }
  }

  return { start: '', end: '' };
}

function inferFestDatesFromEvents(events) {
  const dates = (events || [])
    .flatMap((event) => [event?.eventStartDate, event?.eventEndDate, event?.eventStartDateTime])
    .map(parseIsoDateSafe)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  if (!dates.length) return { start: '', end: '' };
  return { start: dates[0], end: dates[dates.length - 1] };
}

function inferCollegeLocationFromText(websiteText) {
  const text = String(websiteText || '');
  const cityStateMatch = text.match(/\b([A-Za-z .'-]+,\s*[A-Za-z .'-]+)\b/);
  if (cityStateMatch?.[1]) return cityStateMatch[1].trim();

  const known = text.match(/\b(Kochi|Ernakulam|Kerala|Bangalore|Bengaluru|Chennai|Hyderabad|Mumbai|Delhi|India)\b/i);
  if (known?.[1]) return known[1];

  return '';
}

function extractTimeFromDateTime(value) {
  const raw = normalizeDateTimeText(String(value || '').trim());
  if (!raw) return '';
  const fromText = to24HourTime(raw);
  if (fromText) return fromText;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  }
  return '';
}

function extractTeamSizeFromText(text) {
  const source = String(text || '');
  const rangeMatch = source.match(/team[^0-9]{0,6}(\d{1,2})\s*(?:to|\-|–)\s*(\d{1,2})/i);
  if (rangeMatch) {
    return { min: String(rangeMatch[1]), max: String(rangeMatch[2]) };
  }

  const memberRangeMatch = source.match(/\b(\d{1,2})\s*(?:to|\-|–)\s*(\d{1,2})\s*members?\b/i);
  if (memberRangeMatch) {
    return { min: String(memberRangeMatch[1]), max: String(memberRangeMatch[2]) };
  }

  const singleMatch = source.match(/team[^0-9]{0,6}(\d{1,2})\b/i);
  if (singleMatch) {
    return { min: String(singleMatch[1]), max: String(singleMatch[1]) };
  }

  return { min: '', max: '' };
}

function extractDescriptionFromDetailText(text, fallbackTitle = '') {
  const source = String(text || '');
  if (!source) return '';

  const bodyMatch = source.match(/BODY_TEXT:\n([\s\S]*)$/i);
  const body = bodyMatch ? bodyMatch[1] : source;
  const normalizedBody = body.replace(/\s+/g, ' ').trim();

  const missionMatch = normalizedBody.match(/Mission Briefing\s*(.+?)\s*(Projected Bounty|Command Channels|Registration Fee|$)/i);
  if (missionMatch?.[1]) return missionMatch[1].trim();

  const title = String(fallbackTitle || '').trim();
  if (title) {
    const nearTitlePattern = new RegExp(`${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(.+?)\\s*(Registration Fee|Initiate Registration|Back to Events|$)`, 'i');
    const nearTitle = normalizedBody.match(nearTitlePattern);
    if (nearTitle?.[1]) return nearTitle[1].trim();
  }

  const sentenceMatch = normalizedBody.match(/[A-Z][^.?!]{40,260}[.?!]/);
  return sentenceMatch ? sentenceMatch[0].trim() : '';
}

function extractUrlsFromContextText(contextText) {
  const text = String(contextText || '');
  const matches = text.match(/https?:\/\/[^\s)]+/g) || [];
  return Array.from(new Set(matches.map((url) => String(url).replace(/["',]+$/g, ''))));
}

function extractImageCandidatesFromContextText(contextText) {
  const urls = extractUrlsFromContextText(contextText);
  return urls.filter((url) => {
    const lower = String(url).toLowerCase();
    return /\.(png|jpe?g|webp|gif|svg)(\?|$)/.test(lower) || /(image|poster|banner|uploads|cdn)/.test(lower);
  });
}

function slugifyTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function inferParticipationFromText(text, fallbackTitle = '') {
  const content = `${text || ''} ${fallbackTitle || ''}`.toLowerCase();
  if (/\b(individual|solo)\b/.test(content)) return 'individual';
  if (/\b(team|teams|group|squad|duo|pair|members?)\b/.test(content)) return 'team';
  return '';
}

function titleFromEventUrl(url) {
  try {
    const parsed = new URL(url);
    const segment = parsed.pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(segment)
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (m) => m.toUpperCase());
  } catch (_error) {
    return '';
  }
}

function buildFallbackEventsFromContext(websiteText) {
  const urls = extractUrlsFromContextText(websiteText).filter((url) => /\/event\//i.test(url));
  const unique = Array.from(new Set(urls));
  return unique.map((eventUrl) => ({
    title: titleFromEventUrl(eventUrl),
    description: '',
    eventType: '',
    eventStartDateTime: '',
    eventStartDate: '',
    eventStartTime: '',
    eventEndDate: '',
    venue: '',
    participationType: '',
    minTeamSize: '',
    maxTeamSize: '',
    registrationLink: '',
    registrationQrLink: '',
    eventLink: eventUrl,
    bannerImage: '',
    posterImage: '',
  }));
}

async function enrichEventsFromDetailPages(events, rootContextText) {
  const allUrls = extractUrlsFromContextText(rootContextText);
  const detailLinks = allUrls.filter((url) => /\/event\//i.test(url));
  if (!detailLinks.length) return events;

  const extractEventFromDetailUrl = async (eventUrl) => {
    try {
      const detailText = await scrapeWebsiteText(eventUrl);
      const detailFallback = extractFallbackDateTime(detailText);
      const detailTeam = extractTeamSizeFromText(detailText);
      const detailUrls = extractUrlsFromContextText(detailText);
      const detailImages = extractImageCandidatesFromContextText(detailText);

      const regFromDetail = detailUrls.find((url) => /(register|registration|signup|forms|form|bit\.ly|docs\.google|forms\.gle)/i.test(url));
      const qrFromDetail = detailUrls.find((url) => /(qr|qrcode|scan)/i.test(url));
      const venueMatch = String(detailText || '').match(/\b(?:venue|location)\s*[:\-]\s*([^\n]+)/i);
      const venue = venueMatch ? String(venueMatch[1]).trim() : '';
      const participation = inferParticipationFromText(detailText, '');
      const description = extractDescriptionFromDetailText(detailText);
      const inferredType = normalizeEventType(detailText);

      return {
        detailText,
        detailEvent: {
          description,
          eventType: inferredType,
          eventStartDateTime: detailFallback.fallbackDateTime,
          eventStartDate: detailFallback.fallbackDate,
          eventStartTime: detailFallback.fallbackTime,
          eventEndDate: '',
          participationType: participation,
          minTeamSize: detailTeam.min,
          maxTeamSize: detailTeam.max,
          venue,
          registrationLink: regFromDetail || '',
          registrationQrLink: qrFromDetail || '',
          posterImage: detailImages[0] || '',
          bannerImage: detailImages[0] || '',
        },
      };
    } catch (_error) {
      return {
        detailText: '',
        detailEvent: null,
      };
    }
  };

  const enrichOne = async (event) => {
    const existingReg = firstNonEmpty(event?.registrationLink, event?.registrationQrLink);
    const titleSlug = slugifyTitle(event?.title || '');
    const titleKeywords = titleSlug.split('-').filter(Boolean);

    let matchedLink = firstNonEmpty(event?.eventLink);

    if (!matchedLink) {
      matchedLink = detailLinks.find((url) => {
        const low = url.toLowerCase();
        return titleKeywords.length >= 2 && titleKeywords.every((k) => low.includes(k));
      });
    }

    if (!matchedLink) {
      matchedLink = detailLinks.find((url) => {
        const low = url.toLowerCase();
        return titleKeywords.some((k) => k.length > 3 && low.includes(k));
      });
    }

    if (!matchedLink) return event;

    const { detailText, detailEvent } = await extractEventFromDetailUrl(matchedLink);

    if (!detailText && !detailEvent) {
      return {
        ...event,
        registrationLink: existingReg || matchedLink,
      };
    }

    const detailUrls = extractUrlsFromContextText(detailText);
    const regFromDetail = detailUrls.find((url) => /(register|registration|signup|forms|form|bit\.ly|docs\.google)/i.test(url));
    const participation = inferParticipationFromText(detailText, event?.title);

    const startDate = event?.eventStartDate || detailEvent?.eventStartDate || '';
    const startTime = event?.eventStartTime || detailEvent?.eventStartTime || extractTimeFromDateTime(event?.eventStartDateTime || detailEvent?.eventStartDateTime);
    const startDateTime = event?.eventStartDateTime || detailEvent?.eventStartDateTime || (startDate && startTime ? `${startDate}T${startTime}` : '');
    const minTeamSize = event?.minTeamSize || detailEvent?.minTeamSize || '';
    const maxTeamSize = event?.maxTeamSize || detailEvent?.maxTeamSize || '';

    return {
      ...event,
      eventType: normalizeEventType(event?.eventType || detailEvent?.eventType),
      description: event?.description || detailEvent?.description || '',
      eventStartDateTime: startDateTime,
      eventStartDate: startDate,
      eventStartTime: startTime,
      eventEndDate: event?.eventEndDate || detailEvent?.eventEndDate || '',
      participationType:
        event?.participationType ||
        detailEvent?.participationType ||
        normalizeParticipationType('', minTeamSize, maxTeamSize, event?.title, detailText) ||
        participation,
      minTeamSize,
      maxTeamSize,
      venue: event?.venue || detailEvent?.venue || '',
      registrationLink: detailEvent?.registrationLink || regFromDetail || existingReg || matchedLink,
      registrationQrLink: event?.registrationQrLink || detailEvent?.registrationQrLink || '',
      eventLink: event?.eventLink || matchedLink || '',
      posterImage: event?.posterImage || detailEvent?.posterImage || '',
      bannerImage: event?.bannerImage || detailEvent?.bannerImage || '',
    };
  };

  const limit = 40;
  const sliced = events.slice(0, limit);
  const remainder = events.slice(limit);
  const enriched = [];
  for (const event of sliced) {
    const result = await enrichOne(event);
    enriched.push(result);
  }
  return [...enriched, ...remainder];
}

function normalizeExtractResult(parsed, url, websiteText = '') {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const rawEvents = Array.isArray(source.events) ? source.events : [];
  const fallback = extractFallbackDateTime(websiteText);

  const events = rawEvents.map((rawEvent) => ({
    eventStartDateTime: firstNonEmpty(rawEvent?.eventStartDateTime, rawEvent?.event_start_datetime, rawEvent?.startDateTime, fallback.fallbackDateTime),
    title: firstNonEmpty(rawEvent?.title, rawEvent?.event_title),
    description: firstNonEmpty(rawEvent?.description, rawEvent?.event_description),
    eventType: normalizeEventType(firstNonEmpty(rawEvent?.eventType, rawEvent?.event_type)),
    eventStartDate: firstNonEmpty(rawEvent?.eventStartDate, rawEvent?.event_start_date, rawEvent?.date, fallback.fallbackDate),
    eventStartTime: firstNonEmpty(
      rawEvent?.eventStartTime,
      rawEvent?.event_start_time,
      extractTimeFromDateTime(firstNonEmpty(rawEvent?.eventStartDateTime, rawEvent?.event_start_datetime, rawEvent?.startDateTime)),
      fallback.fallbackTime,
    ),
    eventEndDate: firstNonEmpty(rawEvent?.eventEndDate, rawEvent?.event_end_date, rawEvent?.date),
    venue: firstNonEmpty(rawEvent?.venue),
    participationType: normalizeParticipationType(
      firstNonEmpty(rawEvent?.participationType, rawEvent?.participation_type),
      rawEvent?.minTeamSize,
      rawEvent?.maxTeamSize,
      rawEvent?.title,
      rawEvent?.description,
    ),
    minTeamSize: firstNonEmpty(String(rawEvent?.minTeamSize || ''), String(rawEvent?.min_team_size || '')),
    maxTeamSize: firstNonEmpty(String(rawEvent?.maxTeamSize || ''), String(rawEvent?.max_team_size || '')),
    registrationLink: firstNonEmpty(rawEvent?.registrationLink, rawEvent?.registration_link, rawEvent?.registrationQrLink, rawEvent?.registration_qr_link),
    registrationQrLink: firstNonEmpty(rawEvent?.registrationQrLink, rawEvent?.registration_qr_link, rawEvent?.qrLink, rawEvent?.qr_link),
    eventLink: firstNonEmpty(rawEvent?.eventLink, rawEvent?.event_link, url),
    bannerImage: firstNonEmpty(rawEvent?.bannerImage, rawEvent?.banner_image),
    posterImage: firstNonEmpty(rawEvent?.posterImage, rawEvent?.poster_image),
  }));

  const firstEvent = events[0] || {};
  const rawFestName = firstNonEmpty(source.festName, source.fest_name);
  const isLikelyStandalone = events.length <= 1;
  const festName = isLikelyStandalone ? '' : rawFestName;
  const eventDateWindow = inferFestDatesFromEvents(events);
  const textDateWindow = inferFestDatesFromText(websiteText);
  const resolvedFestStartDate = isLikelyStandalone
    ? ''
    : firstNonEmpty(source.festStartDate, source.fest_start_date, eventDateWindow.start, textDateWindow.start);
  const resolvedFestEndDate = isLikelyStandalone
    ? ''
    : firstNonEmpty(source.festEndDate, source.fest_end_date, eventDateWindow.end, textDateWindow.end);

  // Try to infer college name from URL if not found in text
  let collegeName = firstNonEmpty(source.collegeName, source.college_name);
  if (!collegeName && url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      // Extract potential college abbreviation from domain
      if (hostname.includes('vjcet')) collegeName = 'VJCET';
      else if (hostname.includes('gec')) collegeName = 'GEC';
      else if (hostname.includes('tkmce')) collegeName = 'TKMCE';
      else if (hostname.includes('cet')) collegeName = 'CET';
      else if (hostname.includes('mbits')) collegeName = 'MBITS';
      else if (hostname.includes('mec')) collegeName = 'MEC';
    } catch (e) {
      // URL parsing failed, ignore
    }
  }

  return {
    festName,
    collegeName,
    collegeLocation: firstNonEmpty(source.collegeLocation, source.college_location, inferCollegeLocationFromText(websiteText)),
    collegeWebsite: firstNonEmpty(source.collegeWebsite, source.college_website),
    festStartDate: resolvedFestStartDate,
    festEndDate: resolvedFestEndDate,
    sourceUrl: firstNonEmpty(source.sourceUrl, source.source_url, url),
    events,

    // Backward-compatible top-level event fields for existing single-event clients.
    title: firstNonEmpty(firstEvent.title, source.title, source.event_title),
    event_title: firstNonEmpty(firstEvent.title, source.event_title, source.title),
    description: firstNonEmpty(firstEvent.description, source.description, source.event_description),
    event_description: firstNonEmpty(firstEvent.description, source.event_description, source.description),
    college_name: collegeName || firstNonEmpty(source.college_name, source.collegeName),
    college_location: firstNonEmpty(source.college_location, source.collegeLocation, inferCollegeLocationFromText(websiteText)),
    event_start_datetime: firstNonEmpty(source.event_start_datetime, source.eventStartDateTime, firstEvent.eventStartDateTime, fallback.fallbackDateTime),
    event_start_date: firstNonEmpty(source.event_start_date, source.eventStartDate, firstEvent.eventStartDate, resolvedFestStartDate, fallback.fallbackDate),
    event_start_time: firstNonEmpty(source.event_start_time, source.eventStartTime, firstEvent.eventStartTime, fallback.fallbackTime),
    event_end_date: firstNonEmpty(source.event_end_date, source.eventEndDate, firstEvent.eventEndDate, resolvedFestEndDate),
    venue: firstNonEmpty(source.venue, firstEvent.venue),
    participation_type: normalizeParticipationType(
      firstNonEmpty(source.participation_type, source.participationType, firstEvent.participationType),
      firstEvent.minTeamSize,
      firstEvent.maxTeamSize,
      firstEvent.title,
      firstEvent.description,
    ),
    min_team_size: firstNonEmpty(String(source.min_team_size || ''), String(source.minTeamSize || ''), firstEvent.minTeamSize),
    max_team_size: firstNonEmpty(String(source.max_team_size || ''), String(source.maxTeamSize || ''), firstEvent.maxTeamSize),
    registration_link: firstNonEmpty(source.registration_link, source.registrationLink, source.registration_qr_link, source.registrationQrLink, firstEvent.registrationLink, firstEvent.registrationQrLink),
    registration_qr_link: firstNonEmpty(source.registration_qr_link, source.registrationQrLink, firstEvent.registrationQrLink),
    event_link: firstNonEmpty(source.event_link, source.eventLink, firstEvent.eventLink, url),
    banner_image: firstNonEmpty(source.banner_image, source.bannerImage, firstEvent.bannerImage),
    poster_image: firstNonEmpty(source.poster_image, source.posterImage, firstEvent.posterImage),
  };
}

router.post('/', async (req, res) => {
  try {
    const { url } = req.body || {};
    console.log('[AI API] /ai/extract-event request', { url });
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid "url" in request body' });
    }

    const websiteText = await scrapeWebsiteText(url);
    if (!websiteText) {
      return res.status(422).json({ error: 'Could not extract usable text from website' });
    }

    const prompt = buildPrompt(websiteText);
    let parsed = {};
    try {
      const aiText = await getGroqCompletion(prompt);
      parsed = parseAiJson(aiText);
    } catch (aiError) {
      const aiMessage = String(aiError?.message || '');
      if (/\b429\b|rate limit|tokens per day/i.test(aiMessage)) {
        console.warn('[AI API] /ai/extract-event fallback mode enabled (rate limit)', { url, message: aiMessage });
        parsed = {
          sourceUrl: url,
          events: buildFallbackEventsFromContext(websiteText),
        };
      } else {
        throw aiError;
      }
    }

    const normalized = normalizeExtractResult(parsed, url, websiteText);
    const enrichedEvents = await enrichEventsFromDetailPages(normalized.events || [], websiteText);
    normalized.events = enrichedEvents;

        // Recompute fest date window after detail-page enrichment.
    if (!normalized.festStartDate || !normalized.festEndDate) {
      const enrichedWindow = inferFestDatesFromEvents(enrichedEvents);
      const textWindow = inferFestDatesFromText(websiteText);
      if (!normalized.festStartDate) normalized.festStartDate = enrichedWindow.start || textWindow.start || normalized.festStartDate;
      if (!normalized.festEndDate) normalized.festEndDate = enrichedWindow.end || textWindow.end || normalized.festEndDate;
      if (!normalized.event_start_date) normalized.event_start_date = normalized.festStartDate || normalized.event_start_date;
      if (!normalized.event_end_date) normalized.event_end_date = normalized.festEndDate || normalized.event_end_date;
    }

    // Ensure each fest event gets at least the fest date window when event-specific date is absent.
    if (Array.isArray(normalized.events) && normalized.events.length) {
      normalized.events = normalized.events.map((event) => {
        const eventStartDate = firstNonEmpty(event?.eventStartDate, normalized.festStartDate);
        const eventEndDate = firstNonEmpty(event?.eventEndDate, normalized.festEndDate, eventStartDate);
        const eventStartDateTime = firstNonEmpty(event?.eventStartDateTime, eventStartDate);
        return {
          ...event,
          eventStartDate,
          eventEndDate,
          eventStartDateTime,
        };
      });
    }

    if (Array.isArray(enrichedEvents) && enrichedEvents.length) {
      const first = enrichedEvents[0];
      normalized.title = firstNonEmpty(first.title, normalized.title);
      normalized.event_title = firstNonEmpty(first.title, normalized.event_title);
      normalized.event_start_datetime = firstNonEmpty(first.eventStartDateTime, normalized.event_start_datetime);
      normalized.event_start_date = firstNonEmpty(first.eventStartDate, normalized.event_start_date);
      normalized.event_start_time = firstNonEmpty(first.eventStartTime, normalized.event_start_time);
      normalized.participation_type = firstNonEmpty(first.participationType, normalized.participation_type);
      normalized.registration_link = firstNonEmpty(first.registrationLink, normalized.registration_link);
      normalized.registration_qr_link = firstNonEmpty(first.registrationQrLink, normalized.registration_qr_link);
      normalized.event_link = firstNonEmpty(first.eventLink, normalized.event_link);
      normalized.banner_image = firstNonEmpty(first.bannerImage, normalized.banner_image);
      normalized.poster_image = firstNonEmpty(first.posterImage, normalized.poster_image);
    }

    const missingCritical = (normalized.events || []).slice(0, 10).map((event, index) => {
      const missing = [];
      if (!firstNonEmpty(event?.title)) missing.push('title');
      if (!firstNonEmpty(event?.eventType)) missing.push('eventType');
      if (!firstNonEmpty(event?.participationType)) missing.push('participationType');
      if (!firstNonEmpty(event?.eventStartDate, event?.eventStartDateTime)) missing.push('eventStartDate/eventStartDateTime');
      if (!firstNonEmpty(event?.registrationLink)) missing.push('registrationLink');
      return { index, title: event?.title || '', missing };
    }).filter((item) => item.missing.length > 0);

    if (missingCritical.length) {
      console.warn('[AI API] /ai/extract-event missing critical event fields', {
        url,
        missingCritical,
      });
    }
    console.log('[AI API] /ai/extract-event success', {
      festName: normalized?.festName || null,
      collegeName: normalized?.collegeName || null,
      collegeLocation: normalized?.collegeLocation || null,
      festStartDate: normalized?.festStartDate || null,
      festEndDate: normalized?.festEndDate || null,
      eventCount: Array.isArray(normalized?.events) ? normalized.events.length : 0,
    });

    return res.json(normalized);
  } catch (error) {
    console.error('[extract-event]', error);
    return res.status(500).json({
      error: 'Failed to extract event from website',
      details: error?.message || 'Unknown error',
    });
  }
});

module.exports = router;

