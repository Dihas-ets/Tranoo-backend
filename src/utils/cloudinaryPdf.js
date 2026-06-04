/**
 * PDF Cloudinary pour WhatsApp Meta — accès public ou URL signée (API secret).
 */
const axios = require('axios');
const cloudinary = require('cloudinary').v2;
const {
  storePdfBuffer,
  isVerificationPdfProxyUrl,
  getPublicApiBase,
  getMetaReachableApiBase,
  buildVerificationPdfProxyUrl,
  getPdfByToken,
  extractProxyToken,
} = require('./verificationPdfCache');

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
}

function cloudinaryPdfDeliveryUrl(link) {
  const u = String(link || '').trim();
  if (u.includes('/image/upload/') && /\.pdf(\?|$)/i.test(u)) {
    return u.replace('/image/upload/', '/raw/upload/');
  }
  return u;
}

function parseCloudinaryAsset(url) {
  const u = String(url || '').trim();
  const m = u.match(/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(?:v(\d+)\/)?([^?#]+)/i);
  if (!m) return null;
  let resourceType = m[1] === 'raw' ? 'raw' : 'image';
  let publicId = decodeURIComponent(m[3]);
  if (/\.[a-z0-9]+$/i.test(publicId)) {
    publicId = publicId.replace(/\.[a-z0-9]+$/i, '');
  }
  if (resourceType === 'image' && /\.pdf$/i.test(m[3])) {
    resourceType = 'raw';
  }
  return { resourceType, version: m[2] ? String(m[2]) : undefined, publicId };
}

function buildSignedDeliveryUrl(parsed) {
  if (!apiSecret || !parsed?.publicId) return null;
  const opts = {
    resource_type: parsed.resourceType,
    type: 'upload',
    secure: true,
    sign_url: true,
    format: parsed.resourceType === 'raw' ? 'pdf' : undefined,
  };
  if (parsed.version) opts.version = parsed.version;
  return cloudinary.url(parsed.publicId, opts);
}

async function probePdfUrlOnce(url) {
  for (const method of ['get', 'head']) {
    try {
      let status;
      let contentType;
      if (method === 'head') {
        const head = await axios.head(url, {
          timeout: 15000,
          maxRedirects: 5,
          validateStatus: () => true,
        });
        status = head.status;
        contentType = head.headers['content-type'];
      } else {
        const get = await axios.get(url, {
          timeout: 20000,
          maxRedirects: 5,
          responseType: 'stream',
          validateStatus: () => true,
          maxContentLength: 4096,
        });
        status = get.status;
        contentType = get.headers['content-type'];
        if (get.data?.destroy) get.data.destroy();
      }
      if (status >= 200 && status < 400) {
        return { ok: true, status, contentType, url, method };
      }
      return { ok: false, status, url, method };
    } catch (e) {
      return { ok: false, status: e.response?.status, url, method, error: e.message };
    }
  }
  return { ok: false, url };
}

/**
 * Trouve une URL PDF que Meta peut GET (public ou signée avec vos clés API).
 */
async function resolvePublicPdfUrl(originalUrl) {
  const link = String(originalUrl || '').trim();
  const attempts = [];

  if (isVerificationPdfProxyUrl(link)) {
    const token = extractProxyToken(link);
    if (token && getPdfByToken(token)) {
      const publicUrl = buildVerificationPdfProxyUrl(token, getMetaReachableApiBase());
      attempts.push({ type: 'tranoo_proxy_cache', ok: true, url: publicUrl });
      console.log('[CLOUDINARY][PDF] proxy Tranoo (cache local) prêt pour Meta', {
        base: getMetaReachableApiBase(),
        tokenPrefix: `${token.slice(0, 8)}…`,
      });
      return { ok: true, url: publicUrl, signed: false, proxy: true, attempts };
    }
    const probe = await probePdfUrlOnce(link);
    attempts.push({ type: 'tranoo_proxy_http', ...probe });
    if (probe.ok) {
      console.log('[CLOUDINARY][PDF] URL proxy Tranoo accessible (HTTP)', {
        base: getPublicApiBase(),
        status: probe.status,
      });
      return { ok: true, url: probe.url, signed: false, proxy: true, attempts };
    }
    console.warn(
      '[CLOUDINARY][PDF] proxy Tranoo inaccessible — PUBLIC_API_BASE_URL=https://api.tranoo.store en prod, ou ré-uploadez le PDF'
    );
  }

  const candidates = [...new Set([link, cloudinaryPdfDeliveryUrl(link)].filter(Boolean))];

  for (const url of candidates) {
    const probe = await probePdfUrlOnce(url);
    attempts.push({ type: 'unsigned', ...probe });
    if (probe.ok) {
      console.log('[CLOUDINARY][PDF] URL accessible (sans signature)', {
        method: probe.method,
        status: probe.status,
      });
      return { ok: true, url: probe.url, signed: false, attempts };
    }
  }

  const parsed =
    parseCloudinaryAsset(link) || parseCloudinaryAsset(cloudinaryPdfDeliveryUrl(link));
  if (parsed && apiSecret) {
    const signed = buildSignedDeliveryUrl(parsed);
    if (signed) {
      const probe = await probePdfUrlOnce(signed);
      attempts.push({ type: 'signed', ...probe });
      if (probe.ok) {
        console.log('[CLOUDINARY][PDF] URL signée accessible (API secret serveur)', {
          publicId: parsed.publicId,
          method: probe.method,
        });
        return { ok: true, url: signed, signed: true, attempts };
      }
    }
  } else if (!apiSecret) {
    console.warn('[CLOUDINARY][PDF] CLOUDINARY_API_SECRET manquant — impossible de signer l’URL');
  }

  console.error('[CLOUDINARY][PDF] aucune URL PDF accessible pour Meta', { attempts, parsed });
  return {
    ok: false,
    attempts,
    hint:
      'Cloudinary bloque souvent la livraison PDF (401). Ré-uploadez via POST /notifications/verification-pdf ' +
      'pour obtenir une URL proxy api.tranoo.store, ou activez PDF delivery dans Cloudinary → Security.',
  };
}

/**
 * Upload PDF côté serveur (clés API) — accès public explicite.
 */
async function uploadVerificationPdfBuffer(buffer, filename = 'rapport-verification-tranoo.pdf') {
  if (!cloudName || !apiKey || !apiSecret) {
    const err = new Error('cloudinary_not_configured');
    err.code = 'cloudinary_not_configured';
    throw err;
  }

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'raw',
        folder: 'tranoo/verification/documents',
        access_mode: 'public',
        format: 'pdf',
        use_filename: true,
        unique_filename: true,
        filename_override: filename.replace(/\.pdf$/i, ''),
      },
      (error, uploadResult) => {
        if (error) reject(error);
        else resolve(uploadResult);
      }
    );
    stream.end(buffer);
  });

  console.log('[CLOUDINARY][PDF] upload serveur OK', {
    public_id: result.public_id,
    secure_url: result.secure_url,
    bytes: result.bytes,
  });

  const { token, proxyUrl } = storePdfBuffer(buffer, filename);
  const metaProxyUrl = buildVerificationPdfProxyUrl(token, getMetaReachableApiBase());
  const cdnProbe = await resolvePublicPdfUrl(result.secure_url);

  if (cdnProbe.ok) {
    console.log('[CLOUDINARY][PDF] livraison Meta via CDN Cloudinary (HTTPS)', {
      public_id: result.public_id,
    });
    return {
      secure_url: result.secure_url,
      pdfUrl: cdnProbe.url,
      public_id: result.public_id,
      signed: cdnProbe.signed === true,
      delivery: 'cloudinary',
      cloudinaryCdnOk: true,
    };
  }

  console.warn(
    '[CLOUDINARY][PDF] CDN indisponible — repli proxy Tranoo',
    { metaProxyUrl, public_id: result.public_id }
  );
  const proxyProbe = await resolvePublicPdfUrl(metaProxyUrl);
  if (!proxyProbe.ok) {
    const err = new Error('pdf_proxy_unreachable');
    err.code = 'pdf_not_public';
    err.probe = { cdn: cdnProbe, proxy: proxyProbe, localProxy: proxyUrl };
    throw err;
  }

  return {
    secure_url: result.secure_url,
    pdfUrl: proxyProbe.url,
    public_id: result.public_id,
    signed: false,
    delivery: 'tranoo_proxy',
    cloudinaryCdnOk: false,
  };
}

/**
 * URL PDF utilisable par Meta, e-mail et notification (HTTPS, sonde OK si possible).
 */
async function resolvePdfUrlForDelivery(originalUrl) {
  const link = String(originalUrl || '').trim();
  if (!link) return { ok: false, url: null, attempts: [] };
  const normalized = cloudinaryPdfDeliveryUrl(link);
  return resolvePublicPdfUrl(normalized);
}

module.exports = {
  cloudinaryPdfDeliveryUrl,
  parseCloudinaryAsset,
  resolvePublicPdfUrl,
  resolvePdfUrlForDelivery,
  uploadVerificationPdfBuffer,
  isVerificationPdfProxyUrl,
};
