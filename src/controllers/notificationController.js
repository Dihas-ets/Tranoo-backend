const axios = require('axios');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Article = require('../models/Article');
const Payment = require('../models/Payment');
const admin = require('firebase-admin');
const { sendMail, buildVerificationEmailHtml } = require('../utils/emailService');
const {
  extractVerificationBodyFragment,
  plainTextFromHtml,
} = require('../utils/verificationMessage');
const {
  sendWhatsAppVerificationDocument,
  formatMetaError,
  digitsOnly,
  cloudinaryPdfDeliveryUrl,
} = require('../utils/whatsappService');
const {
  uploadVerificationPdfBuffer,
  resolvePdfUrlForDelivery,
} = require('../utils/cloudinaryPdf');
const {
  buildNotificationContent,
  localizedPushTexts,
  resolveUserLocale,
  formatTemplate,
} = require('../utils/notificationI18n');

async function resolveVerificationBuyerUser(articleId) {
  if (!articleId) return null;
  const payment = await Payment.findOne({
    status: 'success',
    type: 'verification',
    customId: new RegExp(`VERIFICATION_${articleId}`, 'i'),
  })
    .sort({ createdAt: -1 })
    .lean();
  if (!payment?.user) return null;
  return User.findById(payment.user);
}

/** E-mail / WhatsApp / nom affiché : champs du compose admin en priorité. */
function resolveComposeDeliveryContacts(recipient, accountUser) {
  const name =
    (recipient?.name && String(recipient.name).trim()) ||
    [accountUser?.prenoms, accountUser?.nom].filter(Boolean).join(' ').trim() ||
    'Client';

  const idOrEmail =
    recipient?.idOrEmail && String(recipient.idOrEmail).trim()
      ? String(recipient.idOrEmail).trim()
      : '';
  const email =
    idOrEmail && idOrEmail.includes('@')
      ? idOrEmail
      : accountUser?.email
        ? String(accountUser.email).trim()
        : null;

  const phone =
    (recipient?.phone && String(recipient.phone).trim()) ||
    (accountUser?.telephone && String(accountUser.telephone).trim()) ||
    '';

  return { name, email, phone };
}

// Créer une notification générique
exports.createNotification = async (
  recipientId,
  senderId,
  title,
  message,
  type = 'general',
  relatedId = null,
  relatedModel = null,
  extraData = {},
  i18n = null,
  notificationActions = null,
) => {
  try {
    const i18nPayload =
      i18n && i18n.titleKey && i18n.messageKey
        ? buildNotificationContent(i18n)
        : null;

    const notification = new Notification({
      recipient: recipientId,
      sender: senderId,
      title: i18nPayload?.title ?? title,
      message: i18nPayload?.message ?? message,
      titleKey: i18nPayload?.titleKey ?? null,
      messageKey: i18nPayload?.messageKey ?? null,
      i18nParams: i18nPayload?.i18nParams ?? null,
      type,
      relatedId,
      relatedModel,
      data: extraData && typeof extraData === 'object' ? extraData : {},
      ...(Array.isArray(notificationActions) && notificationActions.length > 0
        ? { actions: notificationActions }
        : {}),
    });

    await notification.save();

    // Envoyer une notification push si l'utilisateur a un token FCM
    const recipient = await User.findById(recipientId);
    if (recipient && recipient.fcmToken) {
      try {
        const locale = resolveUserLocale(recipient);
        const pushTexts =
          i18nPayload != null
            ? localizedPushTexts(i18nPayload, locale)
            : { title: String(title ?? ''), body: String(message ?? '') };

        const fcmSafeData = {};
        if (extraData && typeof extraData === 'object') {
          Object.entries(extraData).forEach(([k, v]) => {
            if (v !== undefined && v !== null) {
              // FCM exige des strings dans "data"
              // On stringify les objets/arrays pour éviter "messaging/invalid-payload"
              if (typeof v === 'object') {
                try {
                  fcmSafeData[k] = JSON.stringify(v);
                } catch (_) {
                  fcmSafeData[k] = String(v);
                }
              } else {
                fcmSafeData[k] = String(v);
              }
            }
          });
        }
        const fcmData = {
          type: String(type ?? 'general'),
          notificationId: String(notification._id),
          relatedId: relatedId ? String(relatedId) : '',
          relatedModel:
            relatedModel !== undefined && relatedModel !== null
              ? String(relatedModel)
              : '',
          title: pushTexts.title,
          message: pushTexts.body,
          ...(i18nPayload?.titleKey
            ? { titleKey: String(i18nPayload.titleKey) }
            : {}),
          ...(i18nPayload?.messageKey
            ? { messageKey: String(i18nPayload.messageKey) }
            : {}),
          ...(i18nPayload?.i18nParams
            ? { i18nParams: JSON.stringify(i18nPayload.i18nParams) }
            : {}),
          ...fcmSafeData,
        };
        const urgentTypes = ['alerte', 'proposition_alerte'];
        const isAlertePush = urgentTypes.includes(String(type ?? ''));
        // Alertes / propositions : push data-only → notif locale avec son + plein écran.
        const fcmMessage = {
          token: recipient.fcmToken,
          data: fcmData,
          android: {
            priority: 'high',
          },
          apns: {
            payload: {
              aps: {
                contentAvailable: true,
                sound: 'default',
              },
            },
          },
        };
        if (!isAlertePush) {
          fcmMessage.notification = {
            title: pushTexts.title,
            body: pushTexts.body,
          };
        }
        const resp = await admin.messaging().send(fcmMessage);
        console.log(`[NOTIFICATION] Push envoyée à ${recipient.email} messageId=${resp}`);
      } catch (error) {
        console.error(
          '[NOTIFICATION] Erreur envoi push:',
          {
            message: error?.message,
            code: error?.code,
            stack: error?.stack,
          },
        );
      }
    }

    return notification;
  } catch (error) {
    console.error('[NOTIFICATION] Erreur création:', error);
    throw error;
  }
};

// Créer une notification liée à une livraison
// type d'événement peut être: 'created', 'assigned', 'picked_up', 'arrived', 'delivered', 'refused', 'return'
exports.createDeliveryNotification = async (recipientId, senderId, deliveryId, eventType, _extra = {}) => {
  try {
    const keyMap = {
      created: ['delivery.created.title', 'delivery.created.message'],
      assigned: ['delivery.assigned.title', 'delivery.assigned.message'],
      picked_up: ['delivery.picked_up.title', 'delivery.picked_up.message'],
      arrived: ['delivery.arrived.title', 'delivery.arrived.message'],
      delivered: ['delivery.delivered.title', 'delivery.delivered.message'],
      refused: ['delivery.refused.title', 'delivery.refused.message'],
      return: ['delivery.return.title', 'delivery.return.message'],
    };
    const keys = keyMap[eventType] || ['delivery.updated.title', 'delivery.updated.message'];
    const i18n = {
      titleKey: keys[0],
      messageKey: keys[1],
      params: {},
    };

    return await exports.createNotification(
      recipientId,
      senderId,
      '',
      '',
      'delivery',
      deliveryId,
      'Delivery',
      {
        eventType: eventType,
        ...(typeof _extra === 'object' && _extra ? _extra : {})
      },
      i18n
    );
  } catch (error) {
    console.error('[DELIVERY NOTIF] Erreur création:', error);
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
      title: articleTitle
        ? formatTemplate('verification.ready.title', 'fr', { articleTitle })
        : formatTemplate('verification.ready.titleFallback', 'fr'),
      message: articleTitle
        ? formatTemplate('verification.ready.message', 'fr', { articleTitle })
        : formatTemplate('verification.ready.messageFallback', 'fr'),
      titleKey: articleTitle ? 'verification.ready.title' : 'verification.ready.titleFallback',
      messageKey: articleTitle
        ? 'verification.ready.message'
        : 'verification.ready.messageFallback',
      i18nParams: articleTitle ? { articleTitle } : {},
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
        const locale = resolveUserLocale(recipient);
        const titleKey = articleTitle
          ? 'verification.ready.title'
          : 'verification.ready.titleFallback';
        const messageKey = articleTitle
          ? 'verification.ready.message'
          : 'verification.ready.messageFallback';
        const params = articleTitle ? { articleTitle } : {};
        const pushTitle = formatTemplate(titleKey, locale, params);
        const pushBody = formatTemplate(messageKey, locale, params);
        await admin.messaging().send({
          token: recipient.fcmToken,
          notification: {
            title: pushTitle,
            body: pushBody,
          },
          data: {
            type: 'verification',
            notificationId: notification._id.toString(),
            articleId: articleId.toString(),
            articleTitle: articleTitle,
            titleKey,
            messageKey,
            i18nParams: JSON.stringify(params),
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

    if (action === 'approve' && notification.verificationData?.articleId) {
      try {
        // Mettre à jour verificationStatut → 'accepte' sur l'article
        await Article.findByIdAndUpdate(
          notification.verificationData.articleId,
          {
            $set: {
              verificationStatut: 'accepte',
              verificationDate: new Date(),
            },
          },
        );
      } catch (e) {
        console.warn('[VERIFICATION] Mise à jour verificationStatut accepte:', e?.message);
      }
      try {
        const transitMissionController = require('./transitMissionController');
        await transitMissionController.transfererByArticleAndAcheteur(
          notification.verificationData.articleId,
          userId,
        );
      } catch (transferErr) {
        console.warn(
          '[VERIFICATION] Transfert transitaire:',
          transferErr?.message || transferErr,
        );
      }
    }

    if (action === 'reject' && notification.verificationData?.articleId) {
      try {
        // Mettre à jour verificationStatut → 'refuse' sur l'article
        await Article.findByIdAndUpdate(
          notification.verificationData.articleId,
          {
            $set: {
              verificationStatut: 'refuse',
              verificationDate: new Date(),
            },
          },
        );
      } catch (e) {
        console.warn('[VERIFICATION] Mise à jour verificationStatut refuse:', e?.message);
      }
      try {
        const transitMissionController = require('./transitMissionController');
        await transitMissionController.annulerApresVerificationRejetee(
          notification.verificationData.articleId,
          userId,
        );
      } catch (cancelErr) {
        console.warn(
          '[VERIFICATION] Annulation parcours transitaire:',
          cancelErr?.message || cancelErr,
        );
      }
    }

    // Notifier le dashboard admin (inbox scope=adminDashboard)
    if (notification.verificationData?.articleId) {
      try {
        const art = await Article.findById(notification.verificationData.articleId)
          .select('titre title nom')
          .lean();
        const articleTitle = (art?.titre || art?.title || art?.nom || '').toString();
        const articleIdStr = String(notification.verificationData.articleId);
        const buyer = await User.findById(userId).select('nom prenoms email telephone').lean();
        const buyerLabel = buyer
          ? `${buyer.prenoms || ''} ${buyer.nom || ''}`.trim() || buyer.email || buyer.telephone
          : 'Utilisateur';
        const admins = await User.find({
          $or: [
            { role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire'] } },
            { typeAdmin: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'moderateur', 'marketing', 'responsableService', 'responsablePaiement'] } },
          ],
        }).select('_id');
        for (const adminUser of admins) {
          await exports.createNotification(
            adminUser._id,
            userId,
            '',
            '',
            'verification_result',
            notification.verificationData.articleId,
            'Article',
            {
              audience: 'admin',
              action,
              articleTitle,
              targetArticleId: articleIdStr,
              buyerName: buyerLabel,
            },
            {
              titleKey: 'verification.resultAdmin.title',
              messageKey: 'verification.resultAdmin.message',
              params: {
                action: action === 'approve' ? 'approve' : 'reject',
                articleTitle: articleTitle || articleIdStr,
                articleSuffix: articleTitle ? ` — ${articleTitle}` : '',
                buyerName: buyerLabel,
              },
            }
          );
        }
      } catch (e) {
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
    const {
      page = 1,
      limit = 20,
      unreadOnly = false,
      scope = '',
    } = req.query;
    const skip = (page - 1) * limit;

    const adminRoles = ['admin', 'superAdmin', 'principal', 'gestionnaire'];
    const isAdminUser = adminRoles.includes(String(req.user?.role || ''));
    const wantsAdminInbox =
      scope === 'adminDashboard' || scope === 'admin';

    const filter = { recipient: req.user._id };
    if (wantsAdminInbox && isAdminUser) {
      filter.$or = [
        { 'data.audience': 'admin' },
        { type: { $in: ['verification', 'verification_result'] } },
      ];
    }
    if (unreadOnly === 'true') {
      filter.isRead = false;
    }

    const notifications = await Notification.find(filter)
      .populate('sender', 'nom prenoms photo email')
      .populate('recipient', 'nom prenoms email role')
      .populate('relatedId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
      ...filter,
      isRead: false,
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

// Marquer une notification comme non lue
exports.markAsUnread = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, recipient: req.user._id },
      { isRead: false },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification non trouvée' });
    }

    res.json({ message: 'Notification marquée comme non lue', notification });
  } catch (error) {
    console.error('[NOTIFICATION] Erreur marquage non lu:', error);
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
async function sendFcmForNotification(user, notification, { title, message, type }) {
  if (!user?.fcmToken) return;
  try {
    const extra = notification?.data && typeof notification.data === 'object'
      ? notification.data
      : {};
    const fcmData = {
      type: String(type ?? 'general'),
      notificationId: String(notification._id),
      relatedId: notification?.relatedId ? String(notification.relatedId) : '',
      relatedModel: notification?.relatedModel
        ? String(notification.relatedModel)
        : '',
      action: extra.action ? String(extra.action) : '',
      targetArticleId: extra.targetArticleId
        ? String(extra.targetArticleId)
        : notification?.relatedId
          ? String(notification.relatedId)
          : '',
      targetType: extra.targetType ? String(extra.targetType) : '',
      targetPath: extra.targetPath ? String(extra.targetPath) : '',
      title: String(title ?? ''),
      message: String(message ?? '').replace(/<[^>]+>/g, ' ').slice(0, 500),
    };
    const fcmMessage = {
      token: user.fcmToken,
      data: fcmData,
      notification: {
        title: String(title ?? ''),
        body: String(message ?? '').replace(/<[^>]+>/g, ' ').slice(0, 200),
      },
      android: { priority: 'high' },
    };
    await admin.messaging().send(fcmMessage);
  } catch (error) {
    console.error('[ADMIN MSG] Erreur push FCM:', error?.message || error);
  }
}

exports.createAdminMessageHTTP = async (req, res) => {
  try {
    const {
      type = 'general',
      recipient,
      title,
      message,
      details,
      date,
      images = [],
      documents = [],
      stampUrl,
      signatureUrl,
      articleId,
      bodyHtml,
      pdfUrl,
      secure_url: pdfSecureUrlBody,
      sendEmail: sendEmailBody,
      sendNotification: sendNotificationBody,
      sendWhatsapp: sendWhatsappBody,
    } = req.body;

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
    if (recipient.userId) {
      user = await User.findById(recipient.userId);
      if (user) console.log('[ADMIN MSG] Utilisateur trouvé par userId:', recipient.userId);
    }
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

    let normalizedType = String(type).toLowerCase();
    if (normalizedType === 'alert') normalizedType = 'alerte';
    if (normalizedType === 'notification') normalizedType = 'general';

    let notificationUser = user;
    if (normalizedType === 'verification' && articleId) {
      const buyer = await resolveVerificationBuyerUser(articleId);
      if (buyer) {
        notificationUser = buyer;
        if (!user) user = buyer;
        console.log(
          '[ADMIN MSG] Notification in-app → acheteur paiement:',
          buyer.email,
          buyer._id.toString()
        );
      } else {
        console.warn(
          '[ADMIN MSG] Paiement vérification introuvable pour article',
          articleId
        );
      }
    }

    const delivery = resolveComposeDeliveryContacts(recipient, user);
    console.log('[ADMIN MSG] Destinataire compte:', user.email, user._id.toString());
    console.log('[ADMIN MSG] Contacts envoi (champs compose):', {
      name: delivery.name,
      email: delivery.email,
      phone: delivery.phone ? `${delivery.phone.slice(0, 6)}…` : null,
    });

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
      recipient: notificationUser._id,
      sender: senderId,
      title,
      message,
      type: normalizedType,
      attachments: {
        images: Array.isArray(images) ? images : [],
        documents: Array.isArray(documents) ? documents : [],
        stampUrl,
        signatureUrl,
      },
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

    const sendEmailFlag = !!sendEmailBody;
    const sendWhatsappFlag = !!sendWhatsappBody;
    const sendNotificationFlag =
      sendNotificationBody === undefined || sendNotificationBody === null
        ? true
        : !!sendNotificationBody;

    if (sendWhatsappFlag && normalizedType === 'verification' && !pdfUrl?.trim()) {
      return res.status(400).json({
        message:
          'Un rapport PDF (pdfUrl) est requis pour envoyer la vérification par WhatsApp.',
      });
    }

    const htmlForEmail =
      bodyHtml && String(bodyHtml).trim()
        ? String(bodyHtml)
        : null;
    const pdfUrlRaw =
      pdfUrl && String(pdfUrl).trim() ? String(pdfUrl).trim() : null;
    let pdfUrlClean = pdfUrlRaw
      ? cloudinaryPdfDeliveryUrl(pdfUrlRaw) || pdfUrlRaw
      : null;
    const pdfSecureRaw =
      pdfSecureUrlBody && String(pdfSecureUrlBody).trim()
        ? String(pdfSecureUrlBody).trim()
        : null;
    if (
      pdfUrlClean &&
      /^http:\/\//i.test(pdfUrlClean) &&
      pdfSecureRaw &&
      /^https:\/\//i.test(pdfSecureRaw)
    ) {
      pdfUrlClean = cloudinaryPdfDeliveryUrl(pdfSecureRaw) || pdfSecureRaw;
      console.log('[ADMIN MSG] pdfUrl http remplacé par secure_url Cloudinary HTTPS');
    }
    let pdfUrlDelivery = pdfUrlClean;
    if (pdfUrlClean) {
      const pdfResolved = await resolvePdfUrlForDelivery(pdfUrlClean);
      if (pdfResolved.ok) {
        pdfUrlDelivery = pdfResolved.url;
        console.log('[ADMIN MSG] PDF livraison résolu', {
          delivery: pdfResolved.proxy ? 'proxy' : 'cloudinary',
          host: (() => {
            try {
              return new URL(pdfUrlDelivery).host;
            } catch {
              return '?';
            }
          })(),
        });
      } else {
        console.warn('[ADMIN MSG] PDF non résolu pour canaux externes', pdfResolved.attempts);
      }
    }
    const fragmentHtml = htmlForEmail
      ? extractVerificationBodyFragment(htmlForEmail)
      : extractVerificationBodyFragment(message);
    const plainMessage =
      plainTextFromHtml(message) ||
      plainTextFromHtml(fragmentHtml) ||
      String(message).replace(/<[^>]+>/g, ' ').trim();

    if (normalizedType === 'verification') {
      notifDoc.message = plainMessage;
      notifDoc.data = {
        ...(notifDoc.data && typeof notifDoc.data === 'object' ? notifDoc.data : {}),
        bodyHtml: fragmentHtml || plainMessage,
        pdfUrl: pdfUrlDelivery || pdfUrlClean,
        articleId: articleId ? String(articleId) : undefined,
        channelEmail: sendEmailFlag,
        channelNotification: sendNotificationFlag,
        channelWhatsapp: sendWhatsappFlag,
      };
    }

    let notification = null;
    if (sendNotificationFlag) {
      notification = new Notification(notifDoc);
      await notification.save();
      console.log('[ADMIN MSG] Notification enregistrée en base avec ID:', notification._id.toString());
      await sendFcmForNotification(notificationUser, notification, {
        title,
        message: plainMessage,
        type: normalizedType,
      });
    }

    let emailChannel = { sent: false, skipped: !sendEmailFlag };
    if (normalizedType === 'verification' && sendEmailFlag) {
      try {
        if (delivery.email) {
          const article =
            articleId ? await Article.findById(articleId).select('titre type') : null;

          const html =
            htmlForEmail ||
            buildVerificationEmailHtml({
              user: notificationUser,
              title,
              message: plainMessage,
              details,
              date,
              article,
            });

          const mailAttachments = [];
          if (pdfUrlDelivery) {
            try {
              const pdfResp = await axios.get(pdfUrlDelivery, {
                responseType: 'arraybuffer',
                timeout: 30000,
              });
              mailAttachments.push({
                filename: 'rapport-verification-tranoo.pdf',
                content: Buffer.from(pdfResp.data),
                contentType: 'application/pdf',
              });
            } catch (pdfErr) {
              console.warn('[ADMIN MSG] PDF email non joint:', pdfErr?.message);
            }
          }

          const emailHtml = pdfUrlDelivery
            ? `${html}<p style="margin-top:16px;font-size:14px;"><a href="${pdfUrlDelivery}">Télécharger le rapport PDF</a></p>`
            : html;

          const mailResult = await sendMail({
            to: delivery.email,
            subject: `[Vérification] ${title}`,
            html: emailHtml,
            attachments: mailAttachments,
          });
          if (mailResult?.skipped) {
            emailChannel = {
              sent: false,
              skipped: true,
              reason: 'smtp_not_configured',
            };
            console.warn(
              '[ADMIN MSG] Email non envoyé — SMTP_HOST / SMTP_USER / SMTP_PASS manquants dans .env'
            );
          } else {
            emailChannel = { sent: true, to: delivery.email };
            console.log('[ADMIN MSG] Email envoyé à', delivery.email);
          }
        } else {
          emailChannel = { sent: false, reason: 'no_delivery_email' };
          console.warn('[ADMIN MSG] Aucun e-mail dans le champ compose, email non envoyé');
        }
      } catch (emailError) {
        emailChannel = { sent: false, error: emailError?.message || String(emailError) };
        console.error('[ADMIN MSG] Erreur envoi email:', emailError?.message || emailError);
      }
    }

    let whatsappChannel = { sent: false, skipped: !sendWhatsappFlag };
    if (sendWhatsappFlag && normalizedType === 'verification') {
      const targetPhone = delivery.phone;
      console.log('[ADMIN][WA] ─── compose /admin-message → WhatsApp ───', {
        source: 'dashboard/messages/compose',
        articleId: articleId || null,
        sendWhatsapp: sendWhatsappFlag,
        userId: notificationUser._id?.toString(),
        userUid: notificationUser.uid,
        accountEmail: user.email,
        accountTelephone: user.telephone,
        composePhone: recipient.phone,
        composeEmail: recipient.idOrEmail,
        composeName: recipient.name,
        targetPhoneBrut: targetPhone,
        pdfUrlPresent: Boolean(pdfUrlDelivery),
        pdfUrlHost: pdfUrlDelivery
          ? (() => {
              try {
                return new URL(pdfUrlDelivery).host;
              } catch {
                return '(url invalide)';
              }
            })()
          : null,
        vehicleTitle: title,
        recipientName: delivery.name,
      });
      if (!targetPhone || digitsOnly(targetPhone).length < 8) {
        console.error('[ADMIN][WA] numéro compose absent ou trop court', {
          targetPhone,
          composePhone: recipient.phone,
        });
        return res.status(400).json({
          message:
            'Numéro WhatsApp du destinataire introuvable. Vérifiez le téléphone de l\'acheteur.',
        });
      }
      try {
        const waPdfName = articleId
          ? `verification-${String(articleId)}.pdf`
          : undefined;
        const waRes = await sendWhatsAppVerificationDocument({
          phone: targetPhone,
          pdfUrl: pdfUrlDelivery || pdfUrlClean,
          recipientName: delivery.name,
          vehicleTitle: articleId
            ? `${title} (réf. ${String(articleId)})`
            : title,
          filename: waPdfName,
        });
        whatsappChannel = { sent: true, ...waRes };
        console.log('[ADMIN][WA] synthèse compose', {
          sent: true,
          messageId: waRes.messageId,
          messageStatus: waRes.messageStatus,
          recipientWaId: waRes.recipientWaId,
          from: waRes.senderDisplay,
          pdfProbeOk: waRes.pdfProbeOk,
          targetPhoneDigits: digitsOnly(targetPhone),
        });
      } catch (waErr) {
        console.error('[ADMIN][WA] échec compose', formatMetaError(waErr));
        const waMessages = {
          whatsapp_not_configured:
            'WhatsApp non configuré (WHATSAPP_TOKEN / PHONE_NUMBER_ID).',
          invalid_pdf_url:
            'URL du PDF invalide pour WhatsApp (HTTPS public requis). Réessayez l’envoi après génération du PDF.',
          pdf_not_public:
            'PDF inaccessible pour Meta. Ré-uploadez le rapport depuis le compose.',
        };
        whatsappChannel = {
          sent: false,
          error: waMessages[waErr.code] || waErr.message,
          code: waErr.code,
          probe: waErr.probe,
          details: formatMetaError(waErr),
        };
      }
    }

    if (sendWhatsappFlag && normalizedType === 'verification') {
      console.log('[ADMIN][WA] réponse HTTP channels.whatsapp', whatsappChannel);
    }

    res.status(201).json({
      message: 'Message enregistré',
      notification,
      channels: {
        email: sendEmailFlag ? emailChannel : { sent: false, skipped: true },
        notification: sendNotificationFlag,
        whatsapp: whatsappChannel,
      },
    });
  } catch (error) {
    console.error('[ADMIN MSG] Erreur création:', error, error?.message, error?.stack);
    res.status(500).json({ message: 'Erreur lors de la création du message', details: error?.message });
  }
};

// Créer une demande de recherche véhicule (acheteur -> vendeurs)
exports.createVehicleSearchRequestHTTP = async (req, res) => {
  try {
    const {
      marque,
      modele,
      etat,
      urgence,
      anneeMin,
      anneeMax,
      budgetMax,
      quantity,
      localisation,
      description,
      telephone,
      photos,
    } = req.body || {};

    const cleanMarque = String(marque || '').trim();
    const cleanModele = String(modele || '').trim();
    const cleanEtat = String(etat || '').trim().toLowerCase();
    const cleanPhotos = Array.isArray(photos)
      ? photos.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 8)
      : [];
    const cleanUrgence = String(urgence || '').trim();
    const cleanLocalisation = String(localisation || '').trim();
    const cleanDescription = String(description || '').trim();
    const cleanTelephone = String(telephone || '').trim();
    const cleanQuantityRaw = quantity;
    const cleanQuantity = Math.max(
      1,
      Number.isFinite(Number(cleanQuantityRaw)) ? Number(cleanQuantityRaw) : 1
    );

    if (!cleanMarque || !cleanModele) {
      return res.status(400).json({
        message: 'Les champs marque et modele sont requis.',
      });
    }

    const buyer = await User.findById(req.user?._id).select(
      'nom prenoms email telephone'
    );
    if (!buyer) {
      return res.status(404).json({ message: 'Acheteur introuvable.' });
    }

    const vendeurs = await User.find({
      role: 'vendeur',
      isBlocked: { $ne: true },
      // Ciblage selon type vendeur (compat: null => mixte)
      vendeurType: { $in: [null, 'mixte', 'vehicules'] },
    }).select('_id');

    if (!vendeurs.length) {
      return res.status(200).json({
        message: 'Aucun vendeur a notifier pour le moment.',
        notifiedCount: 0,
      });
    }

    const details = [
      `Marque: ${cleanMarque}`,
      `Modele: ${cleanModele}`,
      cleanEtat ? `Etat: ${cleanEtat}` : null,
      anneeMin ? `Annee min: ${anneeMin}` : null,
      anneeMax ? `Annee max: ${anneeMax}` : null,
      budgetMax ? `Budget max: ${budgetMax} FCFA` : null,
      cleanLocalisation ? `Localisation: ${cleanLocalisation}` : null,
      cleanUrgence ? `Urgence: ${cleanUrgence}` : null,
      cleanDescription ? `Details: ${cleanDescription}` : null,
    ].filter(Boolean).join(' | ');

    const title = 'Nouvelle alerte véhicule';
    const message = `Un acheteur recherche ${cleanQuantity} vehicule(s). Caracteristiques: ${details}`;
    const i18n = {
      titleKey: 'alert.vehicle.title',
      messageKey: 'alert.vehicle.message',
      params: {
        quantity: String(cleanQuantity),
        details,
      },
    };

    await Promise.all(
      vendeurs.map((vendeur) =>
        exports.createNotification(
          vendeur._id,
          'system',
          title,
          message,
          'alerte',
          null,
          null,
          {
            requestType: 'vehicle_search',
            buyerId: buyer._id.toString(),
            buyerNom: String(buyer.nom || '').trim(),
            buyerPrenoms: String(buyer.prenoms || '').trim(),
            buyerEmail: String(buyer.email || '').trim(),
            telephone: cleanTelephone || String(buyer.telephone || '').trim(),
            marque: cleanMarque,
            modele: cleanModele,
            anneeMin: anneeMin ? String(anneeMin).trim() : '',
            anneeMax: anneeMax ? String(anneeMax).trim() : '',
            budgetMax: budgetMax ? String(budgetMax).trim() : '',
            quantity: String(cleanQuantity),
            urgence: cleanUrgence,
            localisation: cleanLocalisation,
            description: cleanDescription,
            photos: cleanPhotos,
            thumbnailUrl: cleanPhotos.length > 0 ? cleanPhotos[0] : '',
            // Important: données acheteur conservées pour le workflow interne,
            // mais le message/sender vendeur restent anonymisés.
          },
          i18n
        )
      )
    );

    return res.status(201).json({
      message: 'Demande envoyee aux vendeurs avec succes.',
      notifiedCount: vendeurs.length,
    });
  } catch (error) {
    console.error('[SEARCH REQUEST] Erreur creation notification:', error);
    return res.status(500).json({
      message: 'Erreur lors de lenvoi de la demande.',
      details: error?.message,
    });
  }
};

// Créer une demande de recherche pièce (acheteur -> vendeurs)
exports.createPieceSearchRequestHTTP = async (req, res) => {
  try {
    const {
      marque,
      modele,
      pieceName,
      annee,
      urgence,
      quantity,
      localisation,
      description,
      telephone,
      photos,
    } = req.body || {};

    const cleanMarque = String(marque || '').trim();
    const cleanModele = String(modele || '').trim();
    const cleanPieceName = String(pieceName || '').trim();
    const cleanPhotos = Array.isArray(photos)
      ? photos.map((p) => String(p || '').trim()).filter(Boolean).slice(0, 8)
      : [];
    const cleanAnnee = String(annee || '').trim();
    const cleanUrgence = String(urgence || '').trim();
    const cleanLocalisation = String(localisation || '').trim();
    const cleanDescription = String(description || '').trim();
    const cleanTelephone = String(telephone || '').trim();
    const cleanQuantityRaw = quantity;
    const cleanQuantity = Math.max(
      1,
      Number.isFinite(Number(cleanQuantityRaw)) ? Number(cleanQuantityRaw) : 1
    );

    if (!cleanMarque || !cleanModele || !cleanPieceName) {
      return res.status(400).json({
        message: 'Les champs marque, modele et pieceName sont requis.',
      });
    }

    const buyer = await User.findById(req.user?._id).select(
      'nom prenoms email telephone'
    );
    if (!buyer) {
      return res.status(404).json({ message: 'Acheteur introuvable.' });
    }

    const vendeurs = await User.find({
      role: 'vendeur',
      isBlocked: { $ne: true },
      // Ciblage selon type vendeur (compat: null => mixte)
      vendeurType: { $in: [null, 'mixte', 'pieces'] },
    }).select('_id');

    if (!vendeurs.length) {
      return res.status(200).json({
        message: 'Aucun vendeur a notifier pour le moment.',
        notifiedCount: 0,
      });
    }

    const details = [
      `Marque: ${cleanMarque}`,
      `Modele: ${cleanModele}`,
      `Piece recherchee: ${cleanPieceName}`,
      cleanAnnee ? `Annee: ${cleanAnnee}` : null,
      cleanUrgence ? `Urgence: ${cleanUrgence}` : null,
      cleanLocalisation ? `Localisation: ${cleanLocalisation}` : null,
      cleanDescription ? `Details: ${cleanDescription}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const title = 'Nouvelle alerte pièce';
    const message =
      `Un acheteur recherche ${cleanQuantity} piece(s): ${cleanPieceName} pour ${cleanMarque} ${cleanModele}. ${details}`;
    const pieceI18n = {
      titleKey: 'alert.piece.title',
      messageKey: 'alert.piece.message',
      params: {
        quantity: String(cleanQuantity),
        pieceName: cleanPieceName,
        marque: cleanMarque,
        modele: cleanModele,
        details,
      },
    };

    await Promise.all(
      vendeurs.map((vendeur) =>
        exports.createNotification(
          vendeur._id,
          'system',
          title,
          message,
          'alerte',
          null,
          null,
          {
            requestType: 'piece_search',
            buyerId: buyer._id.toString(),
            buyerNom: String(buyer.nom || '').trim(),
            buyerPrenoms: String(buyer.prenoms || '').trim(),
            buyerEmail: String(buyer.email || '').trim(),
            telephone: cleanTelephone || String(buyer.telephone || '').trim(),
            marque: cleanMarque,
            modele: cleanModele,
            pieceName: cleanPieceName,
            annee: cleanAnnee,
            urgence: cleanUrgence,
            quantity: String(cleanQuantity),
            localisation: cleanLocalisation,
            description: cleanDescription,
            photos: cleanPhotos,
            thumbnailUrl: cleanPhotos.length > 0 ? cleanPhotos[0] : '',
            // Important: données acheteur conservées pour le workflow interne,
            // mais le message/sender vendeur restent anonymisés.
          },
          pieceI18n
        )
      )
    );

    return res.status(201).json({
      message: 'Demande de piece envoyee aux vendeurs avec succes.',
      notifiedCount: vendeurs.length,
    });
  } catch (error) {
    console.error('[PIECE SEARCH REQUEST] Erreur creation notification:', error);
    return res.status(500).json({
      message: 'Erreur lors de lenvoi de la demande de piece.',
      details: error?.message,
    });
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
/**
 * Upload PDF rapport vérification (serveur Tranoo + API secret Cloudinary).
 * Utilisé par le dashboard compose avant envoi WhatsApp.
 */
exports.uploadVerificationPdfHTTP = async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'Fichier PDF requis (champ formulaire « pdf »).' });
    }
    console.log('[ADMIN][PDF] upload depuis compose', {
      bytes: req.file.size,
      filename: req.file.originalname,
    });
    const result = await uploadVerificationPdfBuffer(
      req.file.buffer,
      req.file.originalname || 'rapport-verification-tranoo.pdf'
    );
    console.log('[ADMIN][PDF] URL utilisable Meta/WhatsApp', {
      signed: result.signed,
      pdfUrl: result.pdfUrl,
    });
    return res.json({
      message: 'PDF prêt pour envoi WhatsApp',
      pdfUrl: result.pdfUrl,
      secure_url: result.secure_url,
      signed: result.signed,
      delivery: result.delivery || 'tranoo_proxy',
      cloudinaryCdnOk: result.cloudinaryCdnOk,
    });
  } catch (e) {
    console.error('[ADMIN][PDF] échec upload', e?.message || e);
    if (e.code === 'cloudinary_not_configured') {
      return res.status(503).json({
        message:
          'Cloudinary non configuré sur api.tranoo (CLOUDINARY_CLOUD_NAME, API_KEY, API_SECRET dans .env).',
      });
    }
    if (e.code === 'pdf_not_public') {
      return res.status(400).json({
        message:
          'Le PDF proxy Tranoo est inaccessible (PUBLIC_API_BASE_URL ?). En prod : PUBLIC_API_BASE_URL=https://api.tranoo.store',
        probe: e.probe,
      });
    }
    return res.status(500).json({ message: e.message || 'Erreur upload PDF' });
  }
};

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
