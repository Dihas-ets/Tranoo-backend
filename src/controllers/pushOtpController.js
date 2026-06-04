const admin = require('firebase-admin');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const UserDevice = require('../models/UserDevice');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const { sendWhatsAppOtpCode } = require('../utils/whatsappService');
const {
  canonicalPhoneDigits,
  internationalPhoneFromDigits,
  phoneLookupVariants,
  maskPhone,
  normalizeBeninDigits,
  digitsOnly,
} = require('../utils/phoneNormalize');
const authConfig = require('../config/authConfig');
const {
  BUYER_ROLES,
  PRO_ROLES,
  normalizeAppParam,
  authAppLabel,
  findUserByPhoneAndApp,
} = require('../utils/authAppPhone');

// Store temporaire pour les codes OTP (en production, utiliser Redis)
const otpStore = new Map();

const generateOTP = () => {
  const len = authConfig.OTP_LENGTH;
  const min = Math.pow(10, len - 1);
  const max = Math.pow(10, len) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
};
const generateSessionId = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const makeKey = ({ telephone, fcmToken, otpSessionId }) =>
  `${String(telephone)}::${String(fcmToken)}::${String(otpSessionId)}`;

const OTP_TTL_MS = authConfig.OTP_TTL_MS;
const OTP_MAX_ATTEMPTS = authConfig.OTP_MAX_ATTEMPTS;

const WHATSAPP_CHANNEL = 'whatsapp';

function maskFcmToken(token) {
  const t = String(token || '').trim();
  if (!t || t.length < 12) return '(vide)';
  return `${t.slice(0, 6)}…${t.slice(-4)}`;
}

const isDevOtpLogged = () =>
  process.env.NODE_ENV !== 'production' ||
  String(process.env.LOG_OTP || '').toLowerCase() === 'true';

const PASSWORD_RESET_AFTER_VERIFY_MS = authConfig.PASSWORD_RESET_AFTER_VERIFY_MS;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

function firebaseEmailsForUser(user) {
  const emails = new Set();
  const d = normalizeBeninDigits(digitsOnly(user?.telephone));
  if (d) {
    if (BUYER_ROLES.has(user.role)) emails.add(`${d}@tranoo.app`);
    if (PRO_ROLES.has(user.role)) emails.add(`pro_${d}@tranoo.app`);
  }
  if (user?.email) emails.add(normalizeEmail(user.email));
  if (user?.mobileCredentials?.login) {
    emails.add(normalizeEmail(user.mobileCredentials.login));
  }
  if (user?.tranooBuyerCredentials?.login) {
    emails.add(normalizeEmail(user.tranooBuyerCredentials.login));
  }
  return [...emails];
}

async function applyPasswordToUserAccounts(user, newPassword) {
  const pwd = String(newPassword);
  const hash = await bcrypt.hash(pwd, 10);
  const updatedUids = new Set();

  const touchUid = async (uid, label) => {
    if (!uid || updatedUids.has(uid)) return;
    await admin.auth().updateUser(uid, { password: pwd });
    updatedUids.add(uid);
    console.log('[RESET] Firebase MDP mis à jour', { uid, label });
  };

  if (user.uid) await touchUid(user.uid, 'mongo.uid');

  for (const email of firebaseEmailsForUser(user)) {
    try {
      const fb = await admin.auth().getUserByEmail(email);
      await touchUid(fb.uid, email);
    } catch (e) {
      if (e?.code !== 'auth/user-not-found') {
        console.warn('[RESET] getUserByEmail ignoré', email, e?.message || e);
      }
    }
  }

  user.password = hash;
  await user.save();
  console.log('[RESET] Mongo MDP mis à jour', {
    userId: String(user._id),
    role: user.role,
    email: user.email,
    firebaseUids: [...updatedUids],
  });

  return [...updatedUids];
}

async function resolveFcmTokensForReset(user, bodyFcmToken) {
  const tokens = new Set();
  const body = String(bodyFcmToken || '').trim();
  const userToken = String(user.fcmToken || '').trim();
  if (body) tokens.add(body);
  if (userToken) tokens.add(userToken);

  try {
    const devices = await UserDevice.find({
      userUid: user.uid,
      fcmToken: { $exists: true, $nin: [null, ''] },
    })
      .sort({ lastSeenAt: -1 })
      .limit(5)
      .select('fcmToken');
    for (const d of devices) {
      const t = String(d.fcmToken || '').trim();
      if (t) tokens.add(t);
    }
  } catch (e) {
    console.warn('[RESET][FCM] lecture UserDevice ignorée:', e.message);
  }

  return [...tokens];
}

async function sendResetOtpFcm({ tokens, otpCode, userUid }) {
  const results = [];
  for (const token of tokens) {
    try {
      await admin.messaging().send(pushOtpMessage({ fcmToken: token, otpCode }));
      console.log('[RESET][FCM] OTP push envoyé', {
        uid: userUid,
        token: maskFcmToken(token),
      });
      results.push({ token, ok: true });
    } catch (e) {
      console.warn('[RESET][FCM] échec push OTP', {
        uid: userUid,
        token: maskFcmToken(token),
        code: e.code,
        message: e.message,
      });
      results.push({ token, ok: false, code: e.code, message: e.message });
    }
  }
  return results;
}

const pushOtpMessage = ({ fcmToken, otpCode }) => ({
  token: String(fcmToken).trim(),
  notification: {
    title: '🔐 Code Tranoo',
    body: `Code de réinitialisation : ${otpCode}`,
  },
  data: {
    type: 'otp',
    code: String(otpCode),
    timestamp: Date.now().toString(),
    action: 'password_reset',
  },
  android: {
    priority: 'high',
    notification: { sound: 'default', priority: 'high' },
  },
  apns: {
    payload: {
      aps: {
        contentAvailable: true,
        badge: 1,
        sound: 'default',
        alert: {
          title: 'Code de vérification Tranoo',
          body: `Votre code : ${otpCode}`,
        },
      },
    },
  },
});

/**
 * Récupération mot de passe : OTP WhatsApp + fallback notification push (FCM).
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { telephone, countryCode, nationalNumber, app, fcmToken: bodyFcmToken } = req.body || {};

    const phoneDigits = canonicalPhoneDigits({
      telephone,
      countryCode,
      nationalNumber,
    });
    if (!phoneDigits || phoneDigits.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Numéro invalide. Vérifiez l\'indicatif pays et le numéro saisi.',
      });
    }

    if (!normalizeAppParam(app)) {
      return res.status(400).json({
        success: false,
        message: 'Application requise (tranoo ou tranoo_pro).',
      });
    }

    const { user, error, authApp, candidates } = await findUserByPhoneAndApp(
      phoneDigits,
      app
    );

    if (error === 'ambiguous') {
      return res.status(409).json({
        success: false,
        message:
          'Plusieurs comptes Pro partagent ce numéro. Contactez le support pour corriger vos données.',
        authApp,
        roles: (candidates || []).map((u) => u.role),
      });
    }

    if (error === 'not_found' || !user?.telephone) {
      const appName = authApp === 'tranoo_pro' ? 'Tranoo Pro' : 'Tranoo';
      return res.status(404).json({
        success: false,
        message: `Aucun compte ${appName} trouvé pour ce numéro WhatsApp.`,
      });
    }

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const sessionKey = phoneDigits;

    console.log('[RESET] demande OTP', {
      phoneDigits,
      authApp: authAppLabel(app),
      userTelephone: user.telephone,
      uid: user.uid,
      role: user.role,
      email: user.email,
      ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
    });

    if (isDevOtpLogged()) {
      console.log(
        `[RESET][DEV] OTP WhatsApp pour ${user.telephone} (uid ${user.uid}): ${otpCode}`
      );
    }

    const waTarget = internationalPhoneFromDigits(
      normalizeBeninDigits(digitsOnly(user.telephone))
    );
    console.log('[RESET][WA] cible envoi =', waTarget, '| saisi =', phoneDigits);

    let waResult = null;
    let waErr = null;
    try {
      waResult = await sendWhatsAppOtpCode({ phone: waTarget, code: otpCode });
    } catch (err) {
      waErr = err;
      console.error('[RESET][WA] WhatsApp OTP:', err?.response?.data || err.message);
    }

    let fcmResults = [];
    let fcmTokenStored = WHATSAPP_CHANNEL;
    if (authConfig.RESET_FCM_FALLBACK) {
      const fcmTokens = await resolveFcmTokensForReset(user, bodyFcmToken);
      console.log('[RESET][FCM] tokens candidats', {
        uid: user.uid,
        count: fcmTokens.length,
        masks: fcmTokens.map(maskFcmToken),
        bodyProvided: Boolean(String(bodyFcmToken || '').trim()),
      });
      if (fcmTokens.length) {
        fcmResults = await sendResetOtpFcm({
          tokens: fcmTokens,
          otpCode,
          userUid: user.uid,
        });
        const firstOk = fcmResults.find((r) => r.ok);
        if (firstOk) fcmTokenStored = firstOk.token;
      } else {
        console.log(
          '[RESET][FCM] aucun token — connectez-vous une fois sur cet appareil pour enregistrer les notifications, ou autorisez-les dans les réglages.'
        );
      }
    }

    const waOk = Boolean(waResult?.sent);
    const fcmOk = fcmResults.some((r) => r.ok);

    if (!waOk && !fcmOk) {
      if (waErr?.code === 'whatsapp_not_configured') {
        return res.status(503).json({
          success: false,
          message:
            'Envoi indisponible. Autorisez les notifications sur cet appareil ou contactez le support.',
        });
      }
      return res.status(503).json({
        success: false,
        message:
          "Impossible d'envoyer le code (WhatsApp et notification). Vérifiez le numéro, autorisez les notifications, ou réessayez.",
      });
    }

    const channelLabel =
      waOk && fcmOk
        ? 'whatsapp+fcm'
        : fcmOk
          ? 'fcm'
          : WHATSAPP_CHANNEL;

    const requestDoc = await PasswordResetRequest.create({
      userUid: user.uid,
      deviceId: sessionKey,
      fcmToken: fcmTokenStored,
      otpHash: hashOtp(otpCode),
      expiresAt,
      attempts: 0,
      status: 'pending',
      audit: {
        attempts: [],
        requestedAt: new Date(),
        channel: channelLabel,
        authApp: authAppLabel(app),
        role: user.role,
        delivery: {
          whatsapp: waOk
            ? {
                ok: true,
                messageId: waResult.messageId,
                messageStatus: waResult.messageStatus,
                toWaId: waResult.recipientWaId,
              }
            : { ok: false, error: waErr?.message || 'whatsapp_failed' },
          fcm: fcmResults.map((r) => ({
            ok: r.ok,
            token: maskFcmToken(r.token),
            code: r.code || null,
          })),
        },
      },
    });

    console.log('[RESET] synthèse envoi OTP', {
      requestId: String(requestDoc._id),
      channels: { whatsapp: waOk, fcm: fcmOk, fcmAttempts: fcmResults.length },
      ...(waOk
        ? {
            waFrom: waResult.senderDisplay,
            waTo: waResult.recipientWaId,
            waMessageId: waResult.messageId,
          }
        : {}),
    });

    const sentToMasked = maskPhone(waTarget);
    let userMessage;
    if (waOk && fcmOk) {
      userMessage = `Code envoyé sur WhatsApp au ${sentToMasked} et par notification sur cet appareil.`;
    } else if (fcmOk) {
      userMessage =
        'Code envoyé par notification sur cet appareil. Vérifiez la barre de notifications Tranoo.';
    } else {
      userMessage = `Code envoyé sur WhatsApp au ${sentToMasked} (numéro enregistré sur votre compte).`;
    }

    return res.json({
      success: true,
      message: userMessage,
      requestId: requestDoc._id,
      deviceId: sessionKey,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
      sentToMasked,
      channels: { whatsapp: waOk, fcm: fcmOk },
      sentToE164: isDevOtpLogged() ? waTarget : undefined,
      ...(isDevOtpLogged() ? { devOtp: otpCode } : {}),
    });
  } catch (error) {
    console.error('[RESET] Erreur requestPasswordReset:', error);
    return res.status(500).json({ success: false, message: 'Erreur. Réessayez.' });
  }
};

exports.verifyPasswordResetOtp = async (req, res) => {
  try {
    const { requestId, deviceId, code } = req.body || {};
    if (!requestId || !deviceId || !code) {
      return res.status(400).json({ success: false, message: 'Champs requis manquants.' });
    }

    console.log('[RESET] vérification OTP', {
      requestId,
      deviceId: String(deviceId).slice(0, 6) + '…',
    });

    const requestDoc = await PasswordResetRequest.findById(requestId);
    if (!requestDoc) {
      return res.status(400).json({ success: false, message: 'Code invalide ou expiré.' });
    }

    if (String(requestDoc.deviceId) !== String(deviceId).trim()) {
      requestDoc.audit.attempts.push({ ok: false, reason: 'device_mismatch' });
      await requestDoc.save();
      return res.status(403).json({ success: false, message: 'Ce téléphone ne correspond pas à la demande.' });
    }

    if (requestDoc.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Demande invalide.' });
    }

    if (Date.now() > new Date(requestDoc.expiresAt).getTime()) {
      requestDoc.status = 'expired';
      requestDoc.audit.attempts.push({ ok: false, reason: 'expired' });
      await requestDoc.save();
      console.log('[RESET] OTP expiré', {
        requestId,
        expiresAt: requestDoc.expiresAt,
        now: new Date().toISOString(),
      });
      return res.status(400).json({ success: false, message: 'Code expiré. Redemandez un code.' });
    }

    if (requestDoc.attempts >= OTP_MAX_ATTEMPTS) {
      requestDoc.status = 'locked';
      requestDoc.audit.attempts.push({ ok: false, reason: 'locked' });
      await requestDoc.save();
      return res.status(429).json({ success: false, message: 'Trop de tentatives. Redemandez un code.' });
    }

    const ok = requestDoc.otpHash === hashOtp(String(code).trim());
    if (!ok) {
      requestDoc.attempts += 1;
      requestDoc.audit.attempts.push({ ok: false, reason: 'bad_code' });
      if (requestDoc.attempts >= OTP_MAX_ATTEMPTS) requestDoc.status = 'locked';
      await requestDoc.save();
      return res.status(400).json({ success: false, message: 'Code incorrect.' });
    }

    requestDoc.status = 'verified';
    requestDoc.verifiedAt = new Date();
    requestDoc.expiresAt = new Date(Date.now() + PASSWORD_RESET_AFTER_VERIFY_MS);
    requestDoc.audit.attempts.push({ ok: true, reason: 'ok' });
    await requestDoc.save();

    console.log('[RESET] OTP vérifié', {
      requestId,
      passwordStepExpiresAt: requestDoc.expiresAt,
    });

    return res.json({ success: true, message: 'Code vérifié.' });
  } catch (error) {
    console.error('[RESET] Erreur verifyPasswordResetOtp:', error);
    return res.status(500).json({ success: false, message: "Erreur. Réessayez." });
  }
};

exports.resetPasswordWithOtp = async (req, res) => {
  try {
    const { requestId, deviceId, newPassword } = req.body || {};
    if (!requestId || !deviceId || !newPassword) {
      return res.status(400).json({ success: false, message: 'Champs requis manquants.' });
    }

    if (String(newPassword).length < authConfig.PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Le mot de passe doit contenir au moins ${authConfig.PASSWORD_MIN_LENGTH} caractères.`,
      });
    }

    const requestDoc = await PasswordResetRequest.findById(requestId);
    if (!requestDoc) {
      return res.status(400).json({ success: false, message: 'Demande invalide.' });
    }

    if (String(requestDoc.deviceId) !== String(deviceId).trim()) {
      return res.status(403).json({ success: false, message: 'Ce téléphone ne correspond pas à la demande.' });
    }

    if (requestDoc.status !== 'verified') {
      return res.status(400).json({ success: false, message: "Veuillez d'abord vérifier le code." });
    }

    if (Date.now() > new Date(requestDoc.expiresAt).getTime()) {
      requestDoc.status = 'expired';
      await requestDoc.save();
      return res.status(400).json({ success: false, message: 'Code expiré. Redemandez un code.' });
    }

    const user = await User.findOne({ uid: requestDoc.userUid });
    if (!user) return res.status(404).json({ success: false, message: 'Compte introuvable.' });

    const updatedUids = await applyPasswordToUserAccounts(user, newPassword);
    if (!updatedUids.length) {
      return res.status(500).json({
        success: false,
        message: 'Impossible de mettre à jour le mot de passe. Contactez le support.',
      });
    }

    // Marquer OTP utilisé + device trusted
    requestDoc.status = 'used';
    requestDoc.usedAt = new Date();
    await requestDoc.save();

    await UserDevice.updateOne(
      { userUid: user.uid, deviceId: requestDoc.deviceId },
      {
        $set: {
          fcmToken: requestDoc.fcmToken,
          isTrusted: true,
          lastSeenAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Confirmation push (legacy) — ignoré pour canal WhatsApp
    if (requestDoc.fcmToken && requestDoc.fcmToken !== WHATSAPP_CHANNEL) {
      try {
        await admin.messaging().send({
          token: String(requestDoc.fcmToken).trim(),
          notification: {
            title: 'Mot de passe modifié',
            body: 'Votre mot de passe a été modifié avec succès.',
          },
          data: { type: 'password_reset_success', timestamp: Date.now().toString() },
        });
      } catch (e) {
        console.log('[RESET] Confirmation push échouée:', e);
      }
    }

    return res.json({ success: true, message: 'Mot de passe réinitialisé.' });
  } catch (error) {
    console.error('[RESET] Erreur resetPasswordWithOtp:', error);
    return res.status(500).json({ success: false, message: "Erreur. Réessayez." });
  }
};

/**
 * Envoyer OTP par notification push (Firebase Cloud Messaging) uniquement.
 * SÉCURITÉ: OTP lié au téléphone + device (FCM token) + session (otpSessionId) + durée courte.
 * L'app envoie le fcmToken du périphérique courant. Le backend vérifie qu'il correspond au token
 * déjà associé au compte (user.fcmToken), pour éviter d'envoyer un OTP à un nouveau device non autorisé.
 */
exports.sendOTP = async (req, res) => {
  try {
    const { telephone, fcmToken } = req.body;

    if (!telephone) {
      return res.status(400).json({ message: 'Numéro de téléphone requis' });
    }
    if (!fcmToken || typeof fcmToken !== 'string' || !fcmToken.trim()) {
      return res.status(400).json({
        message: 'Autorisez les notifications push pour recevoir le code sur cet appareil.',
      });
    }

    const user = await User.findOne({ telephone });
    if (!user) {
      console.log(`[OTP] Utilisateur non trouvé pour le téléphone: ${telephone}`);
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    // Sécurité device: exiger que le device soit déjà associé à ce compte
    if (!user.fcmToken) {
      return res.status(400).json({
        message:
          "Aucun appareil n'est associé à ce compte pour les notifications. Connectez-vous une fois pour enregistrer l’appareil, ou contactez le support.",
      });
    }
    if (String(user.fcmToken).trim() !== String(fcmToken).trim()) {
      return res.status(403).json({
        message:
          "Ce téléphone n'est pas l'appareil associé à ce compte. Utilisez l’appareil habituel ou contactez le support.",
      });
    }

    const otpCode = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    const otpSessionId = generateSessionId();

    // Stocker un hash du code (pas le code en clair)
    otpStore.set(makeKey({ telephone, fcmToken, otpSessionId }), {
      codeHash: hashOtp(otpCode),
      expiresAt,
      uid: user.uid,
      telephone,
      fcmToken: String(fcmToken).trim(),
      otpSessionId,
    });

    const message = {
      token: fcmToken.trim(),
      notification: {
        title: '🔐 Code de vérification Tranoo',
        body: `Votre code OTP : ${otpCode}`,
      },
      data: {
        type: 'otp',
        code: otpCode,
        timestamp: Date.now().toString(),
        action: 'password_reset',
        otpSessionId: otpSessionId,
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            badge: 1,
            sound: 'default',
            alert: {
              title: '🔐 Code de vérification Tranoo',
              body: `Votre code OTP : ${otpCode}`,
            },
          },
        },
      },
    };

    await admin.messaging().send(message);
    console.log(`[OTP] Push envoyé avec succès pour ${user.email}`);

    const maskedPhone =
      telephone.length > 4
        ? telephone.slice(0, -4).replace(/\d/g, '*') + telephone.slice(-4)
        : telephone;

    res.json({
      success: true,
      message: 'Code envoyé par notification push sur cet appareil.',
      phone: maskedPhone,
      otpSessionId,
    });
  } catch (error) {
    console.error('[OTP] Erreur envoi push:', error);

    if (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/invalid-argument') {
      return res.status(400).json({
        message: 'Token de notification invalide. Fermez l’app, rouvrez-la puis réessayez.',
      });
    }
    if (error.code === 'messaging/registration-token-not-registered') {
      return res.status(400).json({
        message: 'Token de notification expiré. Rouvrez l’app et réessayez.',
      });
    }

    res.status(500).json({
      message: "Erreur lors de l'envoi du code. Réessayez.",
      error: error.message,
    });
  }
};

// Vérifier seulement le code OTP (sans réinitialiser le mot de passe)
exports.verifyOTPCode = async (req, res) => {
  try {
    const { telephone, code, fcmToken, otpSessionId } = req.body;
    
    if (!telephone || !code || !fcmToken || !otpSessionId) {
      return res.status(400).json({ 
        message: 'Champs requis: telephone, code, fcmToken, otpSessionId' 
      });
    }

    // Vérifier le code OTP
    const otpEntry = otpStore.get(makeKey({ telephone, fcmToken, otpSessionId }));
    if (!otpEntry) {
      return res.status(400).json({ message: 'Code OTP introuvable' });
    }

    if (Date.now() > otpEntry.expiresAt) {
      otpStore.delete(makeKey({ telephone, fcmToken, otpSessionId }));
      return res.status(400).json({ message: 'Code OTP expiré' });
    }

    if (otpEntry.codeHash !== hashOtp(code)) {
      return res.status(400).json({ message: 'Code OTP invalide' });
    }

    // Code OTP valide - ne pas le supprimer encore
    res.json({ 
      success: true, 
      message: 'Code OTP vérifié avec succès' 
    });

  } catch (error) {
    console.error('Erreur vérification OTP:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la vérification', 
      error: error.message 
    });
  }
};

// Vérifier OTP et réinitialiser mot de passe
exports.verifyOTPAndResetPassword = async (req, res) => {
  try {
    const { telephone, code, newPassword, fcmToken, otpSessionId } = req.body;
    
    if (!telephone || !code || !newPassword || !fcmToken || !otpSessionId) {
      return res.status(400).json({ 
        message: 'Champs requis: telephone, code, newPassword, fcmToken, otpSessionId' 
      });
    }

    // Vérifier le code OTP
    const otpEntry = otpStore.get(makeKey({ telephone, fcmToken, otpSessionId }));
    if (!otpEntry) {
      return res.status(400).json({ message: 'Code OTP introuvable' });
    }

    if (Date.now() > otpEntry.expiresAt) {
      otpStore.delete(makeKey({ telephone, fcmToken, otpSessionId }));
      return res.status(400).json({ message: 'Code OTP expiré' });
    }

    if (otpEntry.codeHash !== hashOtp(code)) {
      return res.status(400).json({ message: 'Code OTP invalide' });
    }

    // Trouver l'utilisateur
    const user = await User.findOne({ telephone });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    // Mettre à jour le mot de passe Firebase
    await admin.auth().updateUser(user.uid, { password: newPassword });

    // Mettre à jour le mot de passe hashé côté Mongo si présent
    if (user.password) {
      const bcrypt = require('bcrypt');
      user.password = await bcrypt.hash(newPassword, 10);
      await user.save();
    }

    // Supprimer le code OTP utilisé
    otpStore.delete(makeKey({ telephone, fcmToken, otpSessionId }));

    // Envoyer une notification de confirmation sur le même appareil
    if (fcmToken && fcmToken.trim()) {
      const confirmationMessage = {
        token: fcmToken.trim(),
        notification: {
          title: '✅ Mot de passe réinitialisé',
          body: 'Votre mot de passe a été modifié avec succès',
        },
        data: {
          type: 'password_reset_success',
          timestamp: Date.now().toString()
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            priority: 'high',
          },
        },
        apns: {
          payload: {
            aps: {
              contentAvailable: true,
              badge: 1,
              sound: 'default',
              alert: {
                title: '✅ Mot de passe réinitialisé',
                body: 'Votre mot de passe a été modifié avec succès',
              },
            },
          },
        },
      };

      try {
        await admin.messaging().send(confirmationMessage);
        console.log(`[OTP] Notification de confirmation envoyée pour ${user.email}`);
      } catch (notifError) {
        console.log('Erreur notification confirmation:', notifError);
        // Ne pas faire échouer la réinitialisation pour une erreur de notification
      }
    }

    res.json({ 
      success: true, 
      message: 'Mot de passe réinitialisé avec succès' 
    });

  } catch (error) {
    console.error('Erreur vérification OTP:', error);
    res.status(500).json({ 
      message: 'Erreur lors de la réinitialisation', 
      error: error.message 
    });
  }
};

// Nettoyer les codes OTP expirés (à appeler périodiquement)
exports.cleanExpiredOTPs = () => {
  const now = Date.now();
  for (const [key, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) {
      otpStore.delete(key);
    }
  }
};

// Nettoyer toutes les 5 minutes
setInterval(() => {
  exports.cleanExpiredOTPs();
}, 5 * 60 * 1000);
