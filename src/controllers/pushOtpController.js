const admin = require('firebase-admin');
const User = require('../models/User');

// Store temporaire pour les codes OTP (en production, utiliser Redis)
const otpStore = new Map();

// Générer un code OTP à 6 chiffres
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Envoyer OTP via FCM
exports.sendOTP = async (req, res) => {
  try {
    const { telephone } = req.body;
    
    if (!telephone) {
      return res.status(400).json({ message: 'Numéro de téléphone requis' });
    }

    // Mode test pour développement
    if (telephone === '+22959399349') {
      const otpCode = generateOTP();
      const expiresAt = Date.now() + 5 * 60 * 1000;
      
      otpStore.set(telephone, { 
        code: otpCode, 
        expiresAt, 
        uid: 'test-uid' 
      });
      
      console.log(`[TEST MODE] OTP généré: ${otpCode} pour ${telephone}`);
      
      return res.json({ 
        success: true, 
        message: 'Code OTP généré (mode test)',
        otpCode: otpCode, // Pour debug
        messageId: 'test-message-id'
      });
    }

    // Vérifier que l'utilisateur existe
    const user = await User.findOne({ telephone });
    if (!user) {
      console.log(`Utilisateur non trouvé pour le téléphone: ${telephone}`);
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }

    console.log(`Utilisateur trouvé: ${user.email}, FCM Token: ${user.fcmToken ? 'présent' : 'absent'}`);

    // Vérifier que l'utilisateur a un FCM token
    if (!user.fcmToken) {
      console.log(`Token FCM manquant pour l'utilisateur: ${user.email}`);
      return res.status(400).json({ 
        message: 'Token FCM manquant. Veuillez vous reconnecter.' 
      });
    }

    // Générer le code OTP
    const otpCode = generateOTP();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // Stocker le code temporairement
    otpStore.set(telephone, { 
      code: otpCode, 
      expiresAt, 
      uid: user.uid 
    });

    // Message FCM
    const message = {
      token: user.fcmToken,
      notification: {
        title: '🔐 Code de Vérification Tranoo',
        body: `Votre code OTP: ${otpCode}`,
      },
      data: {
        type: 'otp',
        code: otpCode,
        timestamp: Date.now().toString(),
        action: 'password_reset'
      },
      android: {
        priority: 'high',
        notification: {
          icon: 'ic_notification',
          color: '#FFA500', // Couleur amber de l'app
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            badge: 1,
            sound: 'default',
            alert: {
              title: '🔐 Code de Vérification Tranoo',
              body: `Votre code OTP: ${otpCode}`
            }
          }
        }
      }
    };

    // Envoyer la notification
    console.log('Tentative d\'envoi FCM pour:', user.email, 'Token:', user.fcmToken);
    const response = await admin.messaging().send(message);
    
    console.log('OTP envoyé avec succès:', response);
    
    res.json({ 
      success: true, 
      message: 'Code OTP envoyé par notification push',
      messageId: response,
      otpCode: otpCode // Pour debug
    });

  } catch (error) {
    console.error('Erreur envoi OTP FCM:', error);
    
    // Gestion des erreurs spécifiques FCM
    if (error.code === 'messaging/invalid-registration-token') {
      return res.status(400).json({ 
        message: 'Token FCM invalide. Veuillez vous reconnecter.' 
      });
    }
    
    if (error.code === 'messaging/registration-token-not-registered') {
      return res.status(400).json({ 
        message: 'Token FCM expiré. Veuillez vous reconnecter.' 
      });
    }

    res.status(500).json({ 
      message: 'Erreur lors de l\'envoi du code OTP', 
      error: error.message 
    });
  }
};

// Vérifier seulement le code OTP (sans réinitialiser le mot de passe)
exports.verifyOTPCode = async (req, res) => {
  try {
    const { telephone, code } = req.body;
    
    if (!telephone || !code) {
      return res.status(400).json({ 
        message: 'Champs requis: telephone, code' 
      });
    }

    // Vérifier le code OTP
    const otpEntry = otpStore.get(telephone);
    if (!otpEntry) {
      return res.status(400).json({ message: 'Code OTP introuvable' });
    }

    if (Date.now() > otpEntry.expiresAt) {
      otpStore.delete(telephone);
      return res.status(400).json({ message: 'Code OTP expiré' });
    }

    if (otpEntry.code !== code) {
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
    const { telephone, code, newPassword } = req.body;
    
    if (!telephone || !code || !newPassword) {
      return res.status(400).json({ 
        message: 'Champs requis: telephone, code, newPassword' 
      });
    }

    // Vérifier le code OTP
    const otpEntry = otpStore.get(telephone);
    if (!otpEntry) {
      return res.status(400).json({ message: 'Code OTP introuvable' });
    }

    if (Date.now() > otpEntry.expiresAt) {
      otpStore.delete(telephone);
      return res.status(400).json({ message: 'Code OTP expiré' });
    }

    if (otpEntry.code !== code) {
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
    otpStore.delete(telephone);

    // Envoyer une notification de confirmation
    if (user.fcmToken) {
      const confirmationMessage = {
        token: user.fcmToken,
        notification: {
          title: '✅ Mot de passe réinitialisé',
          body: 'Votre mot de passe a été modifié avec succès',
        },
        data: {
          type: 'password_reset_success',
          timestamp: Date.now().toString()
        }
      };

      try {
        await admin.messaging().send(confirmationMessage);
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
  for (const [telephone, entry] of otpStore.entries()) {
    if (now > entry.expiresAt) {
      otpStore.delete(telephone);
    }
  }
};

// Nettoyer toutes les 5 minutes
setInterval(() => {
  exports.cleanExpiredOTPs();
}, 5 * 60 * 1000);
