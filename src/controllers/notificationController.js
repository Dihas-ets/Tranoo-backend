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

// Créer une notification générique
exports.createNotification = async (
  recipientId,
  senderId,
  title,
  message,
  type = 'general',
  relatedId = null,
  relatedModel = null,
  extraData = {}
) => {
  try {
    const notification = new Notification({
      recipient: recipientId,
      sender: senderId,
      title,
      message,
      type,
      relatedId,
      relatedModel,
      data: extraData && typeof extraData === 'object' ? extraData : {}
    });

    await notification.save();

    // Envoyer une notification push si l'utilisateur a un token FCM
    const recipient = await User.findById(recipientId);
    if (recipient && recipient.fcmToken) {
      try {
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
          title: String(title ?? ''),
          message: String(message ?? ''),
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
            title: title,
            body: message,
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
    let title = 'Mise à jour livraison';
    let message = 'Votre livraison a été mise à jour.';

    switch (eventType) {
      case 'created':
        title = 'Nouvelle livraison disponible';
        message = 'Une nouvelle livraison est disponible pour prise en charge.';
        break;
      case 'assigned':
        title = 'Livraison assignée';
        message = 'Une livraison vous a été assignée.';
        break;
      case 'picked_up':
        title = 'Colis récupéré';
        message = 'Le colis a été récupéré par le livreur.';
        break;
      case 'arrived':
        title = 'Livreur arrivé';
        message = 'Votre livreur est arrivé. Choisissez de payer ou de retourner le colis.';
        break;
      case 'delivered':
        title = 'Colis livré';
        message = 'Le colis a été livré.';
        break;
      case 'refused':
        title = 'Colis refusé';
        message = 'Le colis a été refusé par le client.';
        break;
      case 'return':
        title = 'Retour de pièce signalé';
        message = 'Le chauffeur a signalé un retour de pièce par l\'acheteur pour cette livraison.';
        break;
      default:
        break;
    }

    return await exports.createNotification(
      recipientId,
      senderId,
      title,
      message,
      'delivery',
      deliveryId,
      'Delivery',
      {
        eventType: eventType,
        ...(typeof _extra === 'object' && _extra ? _extra : {})
      }
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
        { type: 'verification' },
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
    const fcmData = {
      type: String(type ?? 'general'),
      notificationId: String(notification._id),
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
      stampUrl,
      signatureUrl,
      articleId,
      bodyHtml,
      pdfUrl,
      sendEmail: sendEmailBody,
      sendNotification: sendNotificationBody,
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

    if (normalizedType === 'verification' && articleId) {
      const buyer = await resolveVerificationBuyerUser(articleId);
      if (buyer) {
        user = buyer;
        console.log(
          '[ADMIN MSG] Destinataire vérification = acheteur (paiement):',
          user.email,
          user._id.toString()
        );
      } else {
        console.warn(
          '[ADMIN MSG] Paiement vérification introuvable pour article',
          articleId,
          '— destinataire saisi conservé'
        );
      }
    }

    console.log('[ADMIN MSG] Destinataire trouvé:', user.email, user._id.toString());

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

    const sendEmailFlag = !!sendEmailBody;
    const sendNotificationFlag =
      sendNotificationBody === undefined || sendNotificationBody === null
        ? true
        : !!sendNotificationBody;

    const htmlForEmail =
      bodyHtml && String(bodyHtml).trim()
        ? String(bodyHtml)
        : null;
    const pdfUrlClean =
      pdfUrl && String(pdfUrl).trim() ? String(pdfUrl).trim() : null;
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
        pdfUrl: pdfUrlClean,
        channelEmail: sendEmailFlag,
        channelNotification: sendNotificationFlag,
      };
    }

    let notification = null;
    if (sendNotificationFlag) {
      notification = new Notification(notifDoc);
      await notification.save();
      console.log('[ADMIN MSG] Notification enregistrée en base avec ID:', notification._id.toString());
      await sendFcmForNotification(user, notification, {
        title,
        message: plainMessage,
        type: normalizedType,
      });
    }

    if (normalizedType === 'verification' && sendEmailFlag) {
      try {
        if (user.email) {
          const article =
            articleId ? await Article.findById(articleId).select('titre type') : null;

          const html =
            htmlForEmail ||
            buildVerificationEmailHtml({
              user,
              title,
              message: plainMessage,
              details,
              date,
              article,
            });

          const mailAttachments = [];
          if (pdfUrlClean) {
            try {
              const pdfResp = await axios.get(pdfUrlClean, {
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

          const emailHtml = pdfUrlClean
            ? `${html}<p style="margin-top:16px;font-size:14px;"><a href="${pdfUrlClean}">Télécharger le rapport PDF</a></p>`
            : html;

          await sendMail({
            to: user.email,
            subject: `[Vérification] ${title}`,
            html: emailHtml,
            attachments: mailAttachments,
          });
          console.log('[ADMIN MSG] Email envoyé à', user.email);
        } else {
          console.warn('[ADMIN MSG] Aucun email disponible pour le destinataire, email non envoyé');
        }
      } catch (emailError) {
        console.error('[ADMIN MSG] Erreur envoi email:', emailError?.message || emailError);
      }
    }

    res.status(201).json({
      message: 'Message enregistré',
      notification,
      channels: { email: sendEmailFlag, notification: sendNotificationFlag },
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
          }
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
          }
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
