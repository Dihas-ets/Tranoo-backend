const Notification = require('../models/Notification');
const User = require('../models/User');
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
    const notification = new Notification({
      recipient: acheteurId,
      sender: 'system', // Système ou admin
      title: 'Vérification terminée',
      message: 'Votre article a été vérifié. Décidez maintenant de votre achat.',
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
            title: 'Vérification terminée',
            body: 'Votre article a été vérifié. Décidez maintenant de votre achat.'
          },
          data: {
            type: 'verification',
            notificationId: notification._id.toString(),
            articleId: articleId.toString(),
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

    // Envoyer une notification de confirmation à l'admin
    if (notification.verificationData && notification.verificationData.articleId) {
      await this.createNotification(
        'admin', // ID de l'admin (à adapter selon votre logique)
        userId,
        `Achat ${action === 'approve' ? 'validé' : 'rejeté'}`,
        `L'utilisateur a ${action === 'approve' ? 'validé' : 'rejeté'} l'achat de l'article ${notification.verificationData.articleId}`,
        'verification_result',
        notification.verificationData.articleId,
        'Article'
      );
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
