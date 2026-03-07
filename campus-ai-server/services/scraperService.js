const axios = require('axios');
const cheerio = require('cheerio');

function htmlToCleanText(html) {
  const $ = cheerio.load(html || '');
  $('script, style, noscript, svg, iframe, template').remove();
  return $('body')
    .text()
    .replace(/\s+/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function toAbsoluteUrl(baseUrl, href) {
  const raw = String(href || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw, baseUrl).toString();
  } catch (_error) {
    return raw;
  }
}

function getStructuredPageContext(html, url) {
  const $ = cheerio.load(html || '');
  const headings = [];
  $('h1, h2, h3').each((_i, node) => {
    const text = $(node).text().replace(/\s+/g, ' ').trim();
    if (text) headings.push(text);
  });

  const links = [];
  $('a[href]').each((_i, node) => {
    const label = $(node).text().replace(/\s+/g, ' ').trim();
    const href = toAbsoluteUrl(url, $(node).attr('href'));
    if (!href) return;
    links.push({ label, href });
  });

  const images = [];
  $('img[src]').each((_i, node) => {
    const src = toAbsoluteUrl(url, $(node).attr('src'));
    const alt = $(node).attr('alt');
    const title = $(node).attr('title');
    const label = [alt, title].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!src) return;
    images.push({ label, src });
  });

  $('meta[property="og:image"], meta[name="twitter:image"], meta[property="og:image:url"]').each((_i, node) => {
    const content = toAbsoluteUrl(url, $(node).attr('content'));
    if (!content) return;
    images.push({ label: 'meta-image', src: content });
  });

  const registrationLinks = links.filter((item) =>
    /(register|registration|signup|apply|forms|form|tickets|book|join|bit\.ly|docs\.google)/i.test(
      `${item.label} ${item.href}`,
    ),
  );

  const qrCandidates = [];
  $('img[src], a[href]').each((_i, node) => {
    const src = toAbsoluteUrl(url, $(node).attr('src') || $(node).attr('href'));
    const text = [$(node).attr('alt'), $(node).attr('title'), $(node).text()]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!src) return;
    if (/(qr|qrcode|scan|register|registration|forms|form|bit\.ly|docs\.google)/i.test(`${src} ${text}`)) {
      qrCandidates.push({ text, url: src });
    }
  });

  return {
    title: $('title').first().text().replace(/\s+/g, ' ').trim(),
    headings: headings.slice(0, 60),
    links: links.slice(0, 250),
    images: images.slice(0, 250),
    registrationLinks: registrationLinks.slice(0, 120),
    qrCandidates: qrCandidates.slice(0, 120),
  };
}

async function scrapeWebsiteText(url) {
  const requestConfig = {
    timeout: 30000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
    maxRedirects: 5,
    validateStatus: () => true,
  };

  const response = await axios.get(url, requestConfig);
  const status = response?.status;
  const html = typeof response?.data === 'string' ? response.data : '';
  const text = htmlToCleanText(html);
  const structured = getStructuredPageContext(html, url);

  if (!text) {
    throw new Error(
      `Website returned status ${status} with no usable text content`
    );
  }

  if (status >= 400) {
    console.warn('[scraperService] Non-2xx status but extracted text', {
      url,
      status,
      textLength: text.length,
    });
  }

  const contextText = [
    `PAGE_TITLE: ${structured.title || ''}`,
    `HEADINGS:\n${structured.headings.map((item) => `- ${item}`).join('\n')}`,
    `IMAGE_LINKS:\n${structured.images.map((item) => `- ${item.label || 'image'} => ${item.src}`).join('\n')}`,
    `REGISTRATION_LINKS:\n${structured.registrationLinks
      .map((item) => `- ${item.label || 'link'} => ${item.href}`)
      .join('\n')}`,
    `QR_CANDIDATE_LINKS:\n${structured.qrCandidates
      .map((item) => `- ${item.text || 'qr'} => ${item.url}`)
      .join('\n')}`,
    `ALL_LINKS:\n${structured.links.map((item) => `- ${item.label || 'link'} => ${item.href}`).join('\n')}`,
    `BODY_TEXT:\n${text}`,
  ].join('\n\n');

  return contextText.slice(0, 60000);
}

module.exports = {
  scrapeWebsiteText,
};
