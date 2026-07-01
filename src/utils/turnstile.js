/**
 * Vérification serveur Cloudflare Turnstile.
 * @see https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
async function verifyTurnstileToken(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('[CAPTCHA] TURNSTILE_SECRET_KEY manquant — vérification ignorée');
    return { success: true, skipped: true };
  }
  if (!token || typeof token !== 'string') {
    return { success: false, error: 'CAPTCHA_TOKEN_MISSING' };
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });
  if (remoteIp) body.append('remoteip', remoteIp);

  const response = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    },
  );

  const data = await response.json();
  return {
    success: data.success === true,
    error: data['error-codes']?.join(', ') || null,
    hostname: data.hostname,
    skipped: false,
  };
}

function isCaptchaEnabled() {
  return process.env.CAPTCHA_ENABLED !== 'false';
}

module.exports = { verifyTurnstileToken, isCaptchaEnabled };
