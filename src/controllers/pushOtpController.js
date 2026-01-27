const admin = require('firebase-admin');
const crypto = require('crypto');
const User = require('../models/User');
const UserDevice = require('../models/UserDevice');
const PasswordResetRequest = require('../models/PasswordResetRequest');

// Store temporaire pour les codes OTP (en production, utiliser Redis)
const otpStore = new Map();

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateSessionId = () => (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const makeKey = ({ telephone, fcmToken, otpSessionId }) =>
  `${String(telephone)}::${String(fcmToken)}::${String(otpSessionId)}`;

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_MAX_ATTEMPTS = 3;

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const pushOtpMessage = ({ fcmToken, otpCode }) => ({
  token: String(fcmToken).trim(),
  notification: {
    title: '🔐 Code de vérification Tranoo',
    body: `Votre code : ${otpCode}`,
  },
  data: {
    type: 'otp',
    code: String(otpCode), // Code dans data pour extraction par l'app
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
 * NOUVEAU FLUX (deviceId-first)
 * Règle: OTP envoyé uniquement au device (deviceId) ayant initié la demande.
 * Sécurité: demande autorisée uniquement depuis un device "trusted" déjà connu,
 * sinon récupération assistée.
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    const { identifier, deviceId, fcmToken } = req.body || {};
    const email = normalizeEmail(identifier);

    // UX neutre: même réponse si compte inexistant
    const neutralOk = () =>
      res.json({
        success: true,
        message: 'Si le compte existe, un code a été envoyé par notification sur cet appareil.',
      });

    if (!email || !email.includes('@')) return neutralOk();
    if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) return neutralOk();
    if (!fcmToken || typeof fcmToken !== 'string' || !fcmToken.trim()) return neutralOk();

    const user = await User.findOne({ email: email });
    if (!user) return neutralOk();

    // Vérifier que ce device est déjà connu + trusted
    const trustedDevice = await UserDevice.findOne({
      userUid: user.uid,
      deviceId: deviceId.trim(),
      isTrusted: true,
    });

    if (!trustedDevice) {
      return res.status(403).json({
        success: false,
        message:
          "Ce téléphone n'est pas autorisé pour cette récupération. Veuillez contacter le support.",
      });
    }

    // Mettre à jour le token FCM sur le device
    trustedDevice.fcmToken = fcmToken.trim();
    trustedDevice.lastSeenAt = new Date();
    await trustedDevice.save();

    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    const requestDoc = await PasswordResetRequest.create({
      userUid: user.uid,
      deviceId: deviceId.trim(),
      fcmToken: fcmToken.trim(),
      otpHash: hashOtp(otpCode),
      expiresAt,
      attempts: 0,
      status: 'pending',
      audit: { attempts: [], requestedAt: new Date() },
    });

    await admin.messaging().send(pushOtpMessage({ fcmToken: fcmToken.trim(), otpCode }));

    return res.json({
      success: true,
      message: 'Code envoyé par notification sur cet appareil.',
      requestId: requestDoc._id,
      expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
    });
  } catch (error) {
    console.error('[RESET] Erreur requestPasswordReset:', error);
    return res.status(500).json({ success: false, message: "Erreur. Réessayez." });
  }
};

exports.verifyPasswordResetOtp = async (req, res) => {
  try {
    const { requestId, deviceId, code } = req.body || {};
    if (!requestId || !deviceId || !code) {
      return res.status(400).json({ success: false, message: 'Champs requis manquants.' });
    }

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
    requestDoc.audit.attempts.push({ ok: true, reason: 'ok' });
    await requestDoc.save();

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

    await admin.auth().updateUser(user.uid, { password: String(newPassword) });

    if (user.password) {
      const bcrypt = require('bcrypt');
      user.password = await bcrypt.hash(String(newPassword), 10);
      await user.save();
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

    // Confirmation push sur le device demandeur uniquement
    if (requestDoc.fcmToken) {
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
