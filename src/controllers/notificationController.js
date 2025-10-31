const Notification = require('../models/Notification');
const User = require('../models/User');
const Article = require('../models/Article');
const admin = require('firebase-admin');

// Créer une notification
exports.createNotification = async (recipientId, senderId, title, message, type = 'general', relatedId = null, relatedModel = null) => {
  try {
    const notification = new Notification({
      recipient: recipientId,
      sender: senderId,
      title,
      message,
      type,
      relatedId,
      relatedModel
    });

    await notification.save();

    // Envoyer une notification push si l'utilisateur a un token FCM
    const recipient = await User.findById(recipientId);
    if (recipient && recipient.fcmToken) {
      try {
        await admin.messaging().send({
          token: recipient.fcmToken,
          notification: {
            title: title,
            body: message
          },
          data: {
            type: type,
            notificationId: notification._id.toString(),
            relatedId: relatedId ? relatedId.toString() : '',
            relatedModel: relatedModel || ''
          }
        });
        console.log(`[NOTIFICATION] Push envoyée à ${recipient.email}`);
      } catch (error) {
        console.error('[NOTIFICATION] Erreur envoi push:', error);
      }
    }

    return notification;
  } catch (error) {
    console.error('[NOTIFICATION] Erreur création:', error);
    throw error;
  }
};

// Créer une notification de vérification avec actions
exports.createVerificationNotification = async (acheteurId, articleId, verificationData) => {
  try {
    // Récupérer le nom/titre de l'article pour enrichir la notif
    let articleTitle = '';
    try {
      const art = await Article.findById(articleId).select('titre title nom');
      articleTitle = (art?.titre || art?.title || art?.nom || '').toString();
    } catch (_) {}

    const notification = new Notification({
      recipient: acheteurId,
      sender: 'system', // Système ou admin
      title: articleTitle ? `Vérification: ${articleTitle}` : 'Vérification terminée',
      message: articleTitle
        ? `Votre article "${articleTitle}" a été vérifié. Décidez maintenant de votre achat.`
        : 'Votre article a été vérifié. Décidez maintenant de votre achat.',
      type: 'verification',
      relatedId: articleId,
      relatedModel: 'Article',
      actions: [
        {
          label: 'Valider l\'achat',
          action: 'approve',
          color: 'success'
        },
        {
          label: 'Rejeter l\'achat',
          action: 'reject',
          color: 'danger'
        }
      ],
      status: 'pending',
      verificationData: {
        articleId: articleId,
        verificationDate: new Date(),
        verificationDetails: verificationData.details || 'Vérification complète effectuée',
        verificationCost: verificationData.cost || 20000
      }
    });

    await notification.save();

    // Envoyer une notification push FCM
    const recipient = await User.findById(acheteurId);
    if (recipient && recipient.fcmToken) {
      try {
        await admin.messaging().send({
          token: recipient.fcmToken,
          notification: {
            title: articleTitle ? `Vérification: ${articleTitle}` : 'Vérification terminée',
            body: articleTitle
              ? `Votre article "${articleTitle}" a été vérifié. Décidez maintenant de votre achat.`
              : 'Votre article a été vérifié. Décidez maintenant de votre achat.'
          },
          data: {
            type: 'verification',
            notificationId: notification._id.toString(),
            articleId: articleId.toString(),
            articleTitle: articleTitle,
            action: 'verification_ready'
          }
        });
        console.log(`[VERIFICATION] Notification push envoyée à ${recipient.email}`);
      } catch (error) {
        console.error('[VERIFICATION] Erreur envoi push FCM:', error);
      }
    }

    return notification;
  } catch (error) {
    console.error('[VERIFICATION] Erreur création notification:', error);
    throw error;
  }
};

// Traiter l'action de vérification (approve/reject)
exports.handleVerificationAction = async (notificationId, action, userId) => {
  try {
    const notification = await Notification.findById(notificationId);
    if (!notification) {
      throw new Error('Notification non trouvée');
    }

    if (notification.type !== 'verification') {
      throw new Error('Cette notification n\'est pas de type vérification');
    }

    if (notification.recipient.toString() !== userId.toString()) {
      throw new Error('Non autorisé à traiter cette notification');
    }

    // Mettre à jour le statut
    notification.status = action === 'approve' ? 'approved' : 'rejected';
    notification.isRead = true;
    await notification.save();

    // Envoyer une notification de confirmation à tous les admins
    if (notification.verificationData && notification.verificationData.articleId) {
      try {
        const art = await Article.findById(notification.verificationData.articleId).select('titre title nom');
        const articleTitle = (art?.titre || art?.title || art?.nom || '').toString();
        const admins = await require('../models/User').find({ role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire'] } }).select('_id');
        for (const adminUser of admins) {
          await this.createNotification(
            adminUser._id,
            userId,
            `Achat ${action === 'approve' ? 'validé' : 'rejeté'}${articleTitle ? `: ${articleTitle}` : ''}`,
            `L'utilisateur a ${action === 'approve' ? 'validé' : 'rejeté'} l'achat de l'article ${articleTitle || notification.verificationData.articleId}`,
            'verification_result',
            notification.verificationData.articleId,
            'Article'
          );
        }
      } catch(e) {
        console.error('[VERIFICATION] Impossible d\'envoyer la notif admin:', e);
      }
    }

    return notification;
  } catch (error) {
    console.error('[VERIFICATION] Erreur traitement action:', error);
    throw error;
  }
};

// Récupérer les notifications d'un utilisateur
exports.getUserNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;
    const skip = (page - 1) * limit;

    const filter = { recipient: req.user._id };
    if (unreadOnly === 'true') {
      filter.isRead = false;
    }

    const notifications = await Notification.find(filter)
      .populate('sender', 'nom prenoms photo')
      .populate('relatedId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({ 
      recipient: req.user._id, 
      isRead: false 
    });

    res.json({
      notifications,
      total,
      unreadCount,
      hasMore: skip + notifications.length < total
    });
  } catch (error) {
    console.error('[NOTIFICATION] Erreur récupération:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des notifications' });
  }
};

// Marquer une notification comme lue
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: req.user._id },
      { isRead: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification non trouvée' });
    }

    res.json({ message: 'Notification marquée comme lue', notification });
  } catch (error) {
    console.error('[NOTIFICATION] Erreur marquage lu:', error);
    res.status(500).json({ message: 'Erreur lors du marquage' });
  }
};

// Marquer toutes les notifications comme lues
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );

    res.json({ message: 'Toutes les notifications marquées comme lues' });
  } catch (error) {
    console.error('[NOTIFICATION] Erreur marquage tout lu:', error);
    res.status(500).json({ message: 'Erreur lors du marquage' });
  }
};

// Supprimer une notification
exports.deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    const notification = await Notification.findOneAndDelete({
      _id: notificationId,
      recipient: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notification non trouvée' });
    }

    res.json({ message: 'Notification supprimée' });
  } catch (error) {
    console.error('[NOTIFICATION] Erreur suppression:', error);
    res.status(500).json({ message: 'Erreur lors de la suppression' });
  }
};

// Traiter l'action de vérification (HTTP)
exports.handleVerificationActionHTTP = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { action } = req.body;
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Action invalide. Utilisez "approve" ou "reject"' });
    }

    const notification = await exports.handleVerificationAction(notificationId, action, req.user._id);
    res.json({ 
      message: `Achat ${action === 'approve' ? 'validé' : 'rejeté'} avec succès`, 
      notification 
    });
  } catch (error) {
    console.error('[VERIFICATION] Erreur traitement action HTTP:', error);
    res.status(500).json({ message: error.message || 'Erreur lors du traitement de l\'action' });
  }
};

// Créer une notification de vérification (HTTP - Admin uniquement)
exports.createVerificationNotificationHTTP = async (req, res) => {
  try {
    const { acheteurId, articleId, verificationData } = req.body;
    
    if (!acheteurId || !articleId) {
      return res.status(400).json({ message: 'acheteurId et articleId sont requis' });
    }

    const notification = await exports.createVerificationNotification(acheteurId, articleId, verificationData);
    res.status(201).json({ 
      message: 'Notification de vérification créée avec succès', 
      notification 
    });
  } catch (error) {
    console.error('[VERIFICATION] Erreur création notification HTTP:', error);
    res.status(500).json({ message: 'Erreur lors de la création de la notification' });
  }
};

// Créer un message administrateur générique (verification/alert/promotion/notification)
exports.createAdminMessageHTTP = async (req, res) => {
  try {
    const { type = 'general', recipient, title, message, details, date, images = [], stampUrl, signatureUrl, articleId } = req.body;

    if (!req.user) {
      return res.status(401).json({ message: 'Non authentifié' });
    }

    if (!recipient || (!recipient.phone && !recipient.idOrEmail && !recipient.userId)) {
      return res.status(400).json({ message: 'Spécifiez recipient.phone ou recipient.idOrEmail ou recipient.userId' });
    }
    if (!title || !message) {
      return res.status(400).json({ message: 'title et message sont requis' });
    }

    console.log('[ADMIN MSG] Recherche destinataire:', recipient);
    let user = null;
    if (recipient.userId) user = await User.findById(recipient.userId);
    if (!user && recipient.phone) user = await User.findOne({ telephone: recipient.phone });
    if (!user && recipient.idOrEmail) {
      try {
        user = await User.findById(recipient.idOrEmail);
        if (user) console.log(`[ADMIN MSG] Utilisateur trouvé par _id : ${recipient.idOrEmail}`);
      } catch (err) {}
      if (!user) {
        user = await User.findOne({ email: recipient.idOrEmail });
        if (user) console.log(`[ADMIN MSG] Utilisateur trouvé par email : ${recipient.idOrEmail}`);
      }
    }
    if (!user) {
      console.error('[ADMIN MSG] Destinataire introuvable pour:', recipient);
      return res.status(404).json({ message: 'Destinataire introuvable' });
    }
    console.log('[ADMIN MSG] Destinataire trouvé:', user.email, user._id.toString());

    let normalizedType = String(type).toLowerCase();
    if (normalizedType === 'alert') normalizedType = 'alerte';
    if (normalizedType === 'notification') normalizedType = 'general';

    // Détermination du sender (ObjectId ou email/uid fallback)
    let senderId = null;
    if (req.user._id) {
      senderId = req.user._id;
      console.log('[ADMIN MSG] Sender utilisé comme ObjectId (backend sécurisé):', senderId.toString());
    } else if (req.user.email) {
      senderId = req.user.email;
      console.log('[ADMIN MSG] Sender utilisé comme email:', senderId);
    } else if (req.user.uid) {
      senderId = req.user.uid;
      console.log('[ADMIN MSG] Sender utilisé comme uid Firebase:', senderId);
    } else {
      return res.status(400).json({ message: 'Impossible de déterminer le sender (admin) pour la notification.' });
    }

    // Préparer le document de notification
    const notifDoc = {
      recipient: user._id,
      sender: senderId,
      title,
      message,
      type: normalizedType,
      attachments: { images, stampUrl, signatureUrl },
    };

    // Si type vérification, lier l'article
    if (normalizedType === 'verification') {
      if (articleId) {
        console.log('[ADMIN MSG] articleId reçu pour verification:', articleId);
      } else {
        console.warn('[ADMIN MSG] Aucun articleId fourni pour verification');
      }
      notifDoc.verificationData = {
        articleId: articleId || undefined,
        verificationDetails: details || undefined,
        verificationDate: date ? new Date(date) : new Date(),
      };
      if (articleId) {
        notifDoc.relatedId = articleId;
        notifDoc.relatedModel = 'Article';
      }
    } else {
      // champs additionnels pour autres types
      if (details || date) {
        notifDoc.verificationData = undefined; // n/a
      }
    }

    const notification = new Notification(notifDoc);
    await notification.save();
    console.log('[ADMIN MSG] Notification enregistrée en base avec ID:', notification._id.toString());

    res.status(201).json({ message: 'Message enregistré', notification });
  } catch (error) {
    console.error('[ADMIN MSG] Erreur création:', error, error?.message, error?.stack);
    res.status(500).json({ message: 'Erreur lors de la création du message', details: error?.message });
  }
};

// Obtenir le nombre de notifications non lues
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false
    });

    res.json({ unreadCount: count });
  } catch (error) {
    console.error('[NOTIFICATION] Erreur comptage:', error);
    res.status(500).json({ message: 'Erreur lors du comptage' });
  }
};

// Route de test pour envoyer une notification
exports.testNotification = async (req, res) => {
  try {
    const { recipientId, senderId, title, message, type } = req.body;
    
    const notification = await exports.createNotification(
      recipientId,
      senderId,
      title,
      message,
      type
    );
    
    res.json({ 
      message: 'Notification de test envoyée avec succès',
      notification 
    });
  } catch (error) {
    console.error('[NOTIFICATION] Erreur test:', error);
    res.status(500).json({ message: 'Erreur lors de l\'envoi de la notification de test' });
  }
};
