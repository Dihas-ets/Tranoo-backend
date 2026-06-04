const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TTL_MS = 72 * 60 * 60 * 1000;
const MAX_ENTRIES = 120;
const MAX_BYTES = 20 * 1024 * 1024;
const CACHE_DIR = path.join(__dirname, '../../data/verification-pdf-cache');

/** @type {Map<string, { buffer: Buffer, filename: string, expiresAt: number }>} */
const store = new Map();

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function diskPaths(token) {
  return {
    pdf: path.join(CACHE_DIR, `${token}.pdf`),
    meta: path.join(CACHE_DIR, `${token}.json`),
  };
}

function purgeExpired() {
  const now = Date.now();
  for (const [token, entry] of store) {
    if (entry.expiresAt <= now) store.delete(token);
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

function getPublicApiBase() {
  const fromEnv = String(
    process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_BASE_URL || ''
  ).trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  const port = process.env.PORT || 3001;
  return `http://localhost:${port}`;
}

/** Base HTTPS joignable par Meta (jamais localhost). */
function getMetaReachableApiBase() {
  const fromEnv = String(
    process.env.PUBLIC_API_BASE_URL ||
      process.env.API_PUBLIC_BASE_URL ||
      process.env.META_PDF_PUBLIC_BASE_URL ||
      ''
  ).trim();
  if (fromEnv && /^https:\/\//i.test(fromEnv)) {
    return fromEnv.replace(/\/$/, '');
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://api.tranoo.store';
  }
  return 'https://api.tranoo.store';
}

function buildVerificationPdfProxyUrl(token, baseUrl) {
  const base = (baseUrl || getMetaReachableApiBase()).replace(/\/$/, '');
  return `${base}/api/public/verification-reports/${token}`;
}

function isVerificationPdfProxyUrl(url) {
  return /\/api\/public\/verification-reports\/[a-f0-9]{32,128}(?:\.pdf)?(?:\?|$)/i.test(
    String(url || '')
  );
}

function storePdfBuffer(buffer, filename = 'rapport-verification-tranoo.pdf') {
  if (!buffer?.length) {
    const err = new Error('empty_pdf_buffer');
    err.code = 'empty_pdf_buffer';
    throw err;
  }
  if (buffer.length > MAX_BYTES) {
    const err = new Error('pdf_too_large');
    err.code = 'pdf_too_large';
    throw err;
  }
  purgeExpired();
  ensureCacheDir();
  const token = crypto.randomBytes(32).toString('hex');
  const buf = Buffer.from(buffer);
  const safeName = String(filename || 'rapport-verification-tranoo.pdf').replace(/[^\w.\- ]+/g, '_');
  const expiresAt = Date.now() + TTL_MS;
  store.set(token, { buffer: buf, filename: safeName, expiresAt });
  const { pdf, meta } = diskPaths(token);
  fs.writeFileSync(pdf, buf);
  fs.writeFileSync(meta, JSON.stringify({ filename: safeName, expiresAt }));
  const proxyUrl = buildVerificationPdfProxyUrl(token);
  console.log('[VERIFY][PDF] cache proxy', {
    tokenPrefix: `${token.slice(0, 8)}…`,
    bytes: buffer.length,
    proxyUrl,
    ttlHours: TTL_MS / 3600000,
  });
  return { token, proxyUrl };
}

function extractProxyToken(urlOrToken) {
  const raw = String(urlOrToken || '').trim();
  const fromUrl = raw.match(/verification-reports\/([a-f0-9]{32,128})/i);
  const id = (fromUrl ? fromUrl[1] : raw).replace(/\.pdf$/i, '');
  if (!/^[a-f0-9]{32,128}$/i.test(id)) return null;
  return id;
}

function getPdfByToken(token) {
  const id = extractProxyToken(token);
  if (!id) return null;
  purgeExpired();
  const mem = store.get(id);
  if (mem && mem.expiresAt > Date.now()) return mem;

  const { pdf, meta } = diskPaths(id);
  if (!fs.existsSync(pdf) || !fs.existsSync(meta)) return null;
  try {
    const metaObj = JSON.parse(fs.readFileSync(meta, 'utf8'));
    if (!metaObj?.expiresAt || metaObj.expiresAt <= Date.now()) {
      try {
        fs.unlinkSync(pdf);
        fs.unlinkSync(meta);
      } catch (_) {}
      store.delete(id);
      return null;
    }
    const buffer = fs.readFileSync(pdf);
    const entry = {
      buffer,
      filename: metaObj.filename || 'rapport.pdf',
      expiresAt: metaObj.expiresAt,
    };
    store.set(id, entry);
    return entry;
  } catch (_) {
    return null;
  }
}

module.exports = {
  getPublicApiBase,
  getMetaReachableApiBase,
  buildVerificationPdfProxyUrl,
  isVerificationPdfProxyUrl,
  extractProxyToken,
  storePdfBuffer,
  getPdfByToken,
};
