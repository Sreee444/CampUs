const Jimp = require('jimp');
const jsQR = require('jsqr');

const looksLikeHttpUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^https?:\/\//i.test(raw);
};

const normalizeQrTextAsUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  if (looksLikeHttpUrl(raw)) return raw;
  if (/^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(raw)) return `https://${raw}`;
  return '';
};

const tryDecodeBitmap = (bitmap) => {
  if (!bitmap?.data || !bitmap?.width || !bitmap?.height) return '';
  const code = jsQR(new Uint8ClampedArray(bitmap.data), bitmap.width, bitmap.height, {
    inversionAttempts: 'attemptBoth',
  });
  if (!code?.data) return '';
  return normalizeQrTextAsUrl(code.data);
};

async function extractQrUrlFromImage(imagePath) {
  const image = await Jimp.read(imagePath);
  const attempts = [image.clone(), image.clone().greyscale(), image.clone().contrast(0.35)];

  for (const candidate of attempts) {
    const direct = tryDecodeBitmap(candidate.bitmap);
    if (direct) return direct;

    const maxWidth = 1800;
    if (candidate.bitmap.width < maxWidth) {
      const scaled = candidate.clone().resize({ w: maxWidth });
      const scaledResult = tryDecodeBitmap(scaled.bitmap);
      if (scaledResult) return scaledResult;
    }
  }

  return '';
}

module.exports = {
  extractQrUrlFromImage,
};
