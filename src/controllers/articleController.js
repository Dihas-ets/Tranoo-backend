const mongoose = require('mongoose');
const Article = require('../models/Article');
const User = require('../models/User');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const SubscriptionPricing = require('../models/SubscriptionPricing');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function buildCloudinaryVideoVariants(url) {
  if (!url || typeof url !== 'string') return { videoOptimized: url, videoThumbnail: null };
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return { videoOptimized: url, videoThumbnail: null };
  const prefix = url.substring(0, idx + marker.length);
  const suffix = url.substring(idx + marker.length);
  return {
    videoOptimized: `${prefix}q_auto:eco,f_auto,w_1280/${suffix}`,
    videoThumbnail: `${prefix}so_1,q_auto:eco,f_auto,w_480/${suffix}`.replace(/\.[^/.]+$/, '.jpg'),
  };
}

const { normalizeArticleViews } = require('../utils/articleViews');
const {
  scheduleNewArticleSideEffects,
  initAutoViewsSchedule,
} = require('../services/articlePublishService');

function isAlertProposalArticle(articleOrBody) {
  const buyerId = articleOrBody?.alertContext?.buyerId;
  return buyerId != null && String(buyerId).trim() !== '';
}

function applyPublicCatalogFilter(filter, req) {
  const isSellerBrowsingOwnStock =
    req.user?.role === 'vendeur' &&
    filter.vendeur &&
    String(filter.vendeur) === String(req.user._id);
  if (req.user?.role === 'admin' || isSellerBrowsingOwnStock) {
    return;
  }
  filter.$and = filter.$and || [];
  filter.$and.push({
    $or: [
      { 'alertContext.buyerId': { $exists: false } },
      { 'alertContext.buyerId': null },
    ],
  });
}

async function notifyBuyerAlertProposal(article, sellerId) {
  if (!isAlertProposalArticle(article)) return;
  try {
    const notificationController = require('./notificationController');
    const isPiece = (article.type || '').toString().toLowerCase() === 'piece';
    const isMoto = (article.type || '').toString().toLowerCase() === 'moto';
    const detailPath = isPiece ? 'mastervac' : (isMoto ? 'moto_info' : 'cars_info');
    const i18n = {
      titleKey: 'alert.proposal.title',
      messageKey: 'alert.proposal.message',
      params: { articleTitle: article.titre || '' },
    };
    const { buildNotificationContent } = require('../utils/notificationI18n');
    const { title, message } = buildNotificationContent(i18n);
    await notificationController.createNotification(
      article.alertContext.buyerId,
      sellerId,
      title,
      message,
      'proposition_alerte',
      article._id,
      'Article',
      {
        action: 'view_proposal',
        ctaLabel: 'Voir la proposition',
        targetArticleId: article._id.toString(),
        targetType: article.type,
        targetPath: detailPath,
        articleTitle: article.titre || '',
        thumbnailUrl:
          Array.isArray(article.photos) && article.photos.length > 0
            ? article.photos[0]
            : '',
        sourceNotificationId: article.alertContext.sourceNotificationId
          ? article.alertContext.sourceNotificationId.toString()
          : null,
      },
      i18n
    );
  } catch (buyerNotifError) {
    console.error('[ARTICLE] Erreur notification proposition alerte:', buyerNotifError);
  }
}

function withVideoTransforms(doc) {
  if (!doc) return doc;
  const data = normalizeArticleViews(doc);
  const { videoOptimized, videoThumbnail } = buildCloudinaryVideoVariants(data.video);
  return { ...data, videoOptimized, videoThumbnail };
}

async function hasSellerPieceAccess(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return false;

  const inscriptionDate = user.dateInscription || user.createdAt;
  if (inscriptionDate) {
    const pricing =
      (await SubscriptionPricing.findOne({
        key: 'SUBSCRIPTION_PRICING_SINGLETON',
      }).lean()) || {};
    const freeTrialDays = Number(pricing.freeTrialDays ?? 45);
    const trialEnd = new Date(inscriptionDate);
    trialEnd.setDate(trialEnd.getDate() + (Number.isFinite(freeTrialDays) ? freeTrialDays : 45));
    if (new Date() <= trialEnd) return true;
  }

  const sub = await Subscription.findOne({ user: userId }).lean();
  return Boolean(sub && sub.expiresAt && new Date(sub.expiresAt) > new Date());
}

// Créer un article (voiture ou pièce)
exports.createArticle = async (req, res) => {
  try {
    // On suppose que req.user contient l'utilisateur authentifié (vendeur)
    const vendeurId = req.user && req.user._id ? req.user._id.toString() : req.body.vendeur;
    // Restriction abonnement pour pièces vendeurs (trial configurable ou abonnement actif)
    if (
      req.user &&
      req.user.role === 'vendeur' &&
      (req.body.type || '').toString().toLowerCase() === 'piece'
    ) {
      const allowed = await hasSellerPieceAccess(req.user._id);
      if (!allowed) {
        return res.status(403).json({
          message:
            "Abonnement requis: votre periode gratuite est expiree. Activez un plan pour ajouter des pieces.",
        });
      }
    }

    // Correction : Forcer le champ source à 'tranoo' si entreprise=TRANOO
    let source = req.body.source || 'app';
    if (req.body.entreprise && req.body.entreprise.trim().toUpperCase() === 'TRANOO') {
      source = 'tranoo';
    }
    // Publication directe en ligne (validation admin retirée)
    const { normalizeArticleLocation } = require('../services/locationGeocode');
    const lieuRaw = (req.body.lieu || req.body.localisation || '').toString().trim();
    let lieuFields = {};
    if (lieuRaw) {
      const norm = await normalizeArticleLocation(lieuRaw);
      lieuFields = {
        lieu: norm.lieu || lieuRaw,
        localisation: norm.localisation || lieuRaw,
        ...(norm.pays ? { pays: norm.pays } : {}),
      };
    }
    const normalizedLieu = lieuFields.localisation || lieuRaw;
    if ((req.body.type || '').toString().toLowerCase() === 'piece') {
      console.log(
        '[ARTICLE_CREATE][PIECE] fournisseur payload=%j',
        req.body.fournisseur || null
      );
    }
    const article = new Article({
      ...req.body,
      ...lieuFields,
      lieu: lieuFields.lieu ?? req.body.lieu ?? normalizedLieu,
      localisation: lieuFields.localisation ?? req.body.localisation ?? normalizedLieu,
      vendeur: vendeurId,
      statut: 'en_ligne',
      source,
      viewsReal: 0,
      viewsAuto: 0,
    });
    initAutoViewsSchedule(article);
    await article.save();
    if (isAlertProposalArticle(article)) {
      await notifyBuyerAlertProposal(article, vendeurId);
    } else {
      scheduleNewArticleSideEffects(article, vendeurId);
    }
    if ((article.type || '').toString().toLowerCase() === 'piece') {
      console.log(
        '[ARTICLE_CREATE][PIECE] saved fournisseur=%j lieu=%s localisation=%s',
        article.fournisseur || null,
        article.lieu,
        article.localisation
      );
    }
    res.status(201).json({ message: 'Article créé', article: withVideoTransforms(article) });
  } catch (error) {
    console.error('Erreur détaillée lors de la création de l\'article :', error);
    res.status(500).json({ message: 'Erreur lors de la création de l\'article', error });
  }
};

// Lister les articles avec filtres (type, marque, modele, lieu, prix, categorie, etc.)
exports.getArticles = async (req, res) => {
  try {
    const { type, marque, modele, lieu, minPrix, maxPrix, categorie, vendeur, aLaUne, sponsorise, recommande, source, vendu } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (marque) filter.marque = marque;
    if (modele) filter.modele = modele;
    if (lieu) filter.lieu = lieu;
    if (categorie) filter.categorie = categorie;
    if (vendeur) filter.vendeur = vendeur;
    if (aLaUne) filter.aLaUne = aLaUne === 'true';
    if (sponsorise) filter.sponsorise = sponsorise === 'true';
    if (recommande) filter.recommande = recommande === 'true';
    if (source) {
      // On filtre explicitement sur source=tranoo
      if (source === 'tranoo') {
        filter.source = 'tranoo';
      } else {
        filter.source = source;
      }
    }
    if (minPrix || maxPrix) {
      filter.prix = {};
      if (minPrix) filter.prix.$gte = Number(minPrix);
      if (maxPrix) filter.prix.$lte = Number(maxPrix);
    }
    // Filtrage automatique selon le rôle
    if (req.user) {
      if (req.user.role === 'vendeur') {
        if ((type || '').toString().toLowerCase() === 'piece') {
          const allowed = await hasSellerPieceAccess(req.user._id);
          if (allowed) {
            await Article.updateMany(
              { type: 'piece', vendeur: req.user._id, subscriptionLocked: true },
              {
                $set: {
                  subscriptionLocked: false,
                  subscriptionLockedAt: null,
                  statut: 'en_ligne',
                },
              },
            );
          } else {
            await Article.updateMany(
              {
                type: 'piece',
                vendeur: req.user._id,
                subscriptionLocked: { $ne: true },
              },
              {
                $set: {
                  subscriptionLocked: true,
                  subscriptionLockedAt: new Date(),
                  statut: 'en_attente',
                },
              },
            );
          }
        }
        filter.vendeur = req.user._id;
        const requestedStatut = (req.query.statut || '').toString().trim().toLowerCase();
        const allowedSellerStatuts = new Set([
          'en_attente',
          'en_ligne',
          'rejeté',
          'rejete',
          'vendu',
          'non_vendu',
        ]);
        if ((type || '').toString().toLowerCase() !== 'piece') {
          if (allowedSellerStatuts.has(requestedStatut)) {
            filter.statut = requestedStatut === 'rejete' ? 'rejeté' : requestedStatut;
          } else if (requestedStatut) {
            filter.statut = 'en_ligne';
          }
          // Sans statut explicite : tout le stock du vendeur (onglets côté app)
        } else if (allowedSellerStatuts.has(requestedStatut)) {
          filter.statut = requestedStatut === 'rejete' ? 'rejeté' : requestedStatut;
        }
      } else if (req.user.role !== 'admin') {
        filter.statut = 'en_ligne';
        filter.subscriptionLocked = { $ne: true };
      }
      // admin : pas de filtre statut
    } else {
      // Non authentifié : ne voir que les articles en ligne
      filter.statut = 'en_ligne';
      filter.subscriptionLocked = { $ne: true };
    }
    // Filtre vendu/non vendu via statutVente
    if (vendu === 'false') {
      filter.statutVente = { $ne: 'vendu' };
    } else if (vendu === 'true') {
      filter.statutVente = 'vendu';
    }

    applyPublicCatalogFilter(filter, req);

    // LOG DEBUG
    console.log('USER:', req.user);
    console.log('FILTER:', filter);
    const articles = await Article.find(filter)
      .sort({ dateCreation: -1, createdAt: -1 })
      .populate('vendeur', 'nom prenoms email entreprise telephone');
    res.json(articles.map(withVideoTransforms));
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des articles', error });
  }
};

// Alias public qui réutilise la même logique que getArticles
exports.getArticlesPublic = (req, res) => exports.getArticles(req, res);

/** Acheteur ayant payé la vérification pour cet article (dernier paiement success). */
exports.getVerificationBuyer = async (req, res) => {
  try {
    const articleId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(articleId)) {
      return res.status(400).json({ success: false, message: 'ID article invalide' });
    }

    const payment = await Payment.findOne({
      status: 'success',
      type: 'verification',
      customId: new RegExp(`VERIFICATION_${articleId}`, 'i'),
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!payment?.user) {
      return res.status(404).json({
        success: false,
        message: 'Aucun paiement de vérification trouvé pour cet article',
      });
    }

    const user = await User.findById(payment.user)
      .select('nom prenoms email telephone')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'Acheteur introuvable' });
    }

    return res.json({
      success: true,
      user: {
        _id: String(user._id),
        fullName: `${user.prenoms || ''} ${user.nom || ''}`.trim() || 'Client',
        email: user.email || null,
        telephone: user.telephone || null,
      },
      paymentId: String(payment._id),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'acheteur',
      error: error.message,
    });
  }
};

// Détail d'un article
exports.getArticleById = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Article non trouvé' });
    }
    const article = await Article.findById(id).populate('vendeur', 'nom prenoms email entreprise telephone uid');
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    const f = article.fournisseur || {};
    console.log(
      '[ARTICLE_BY_ID] id=%s type=%s fournisseur.lat=%s fournisseur.lng=%s fournisseur.adresse=%s',
      req.params.id,
      article.type,
      f.latitude,
      f.longitude,
      f.adresseTexte
    );
    res.json(withVideoTransforms(article));
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'article', error });
  }
};

// Mettre à jour un article (seul le vendeur ou un admin peut modifier)
exports.updateArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    // Vérifier que l'utilisateur est le vendeur ou un admin
    if (req.user.role !== 'admin' && article.vendeur.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé à modifier cet article' });
    }
    const { normalizeArticleLocation } = require('../services/locationGeocode');
    const lieuRaw = (req.body.lieu || req.body.localisation || '').toString().trim();
    let lieuFields = {};
    if (lieuRaw) {
      const norm = await normalizeArticleLocation(lieuRaw);
      lieuFields = {
        lieu: norm.lieu || lieuRaw,
        localisation: norm.localisation || lieuRaw,
        ...(norm.pays ? { pays: norm.pays } : {}),
      };
    }
    if ((article.type || '').toString().toLowerCase() === 'piece') {
      console.log(
        '[ARTICLE_UPDATE][PIECE] incoming fournisseur payload=%j',
        req.body.fournisseur || null
      );
    }
    Object.assign(article, {
      ...req.body,
      ...(lieuRaw ? lieuFields : {}),
    });
    // Correction : Forcer le champ source à 'tranoo' si entreprise=TRANOO
    if (req.body.entreprise && req.body.entreprise.trim().toUpperCase() === 'TRANOO') {
      article.source = 'tranoo';
    } else if (req.body.source) {
      article.source = req.body.source;
    }
    await article.save();
    if ((article.type || '').toString().toLowerCase() === 'piece') {
      console.log(
        '[ARTICLE_UPDATE][PIECE] saved fournisseur=%j lieu=%s localisation=%s',
        article.fournisseur || null,
        article.lieu,
        article.localisation
      );
    }
    res.json({ message: 'Article mis à jour', article });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour de l\'article', error });
  }
};

// Supprimer un article (seul le vendeur ou un admin peut supprimer)
exports.deleteArticle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    // Vérifier que l'utilisateur est le vendeur ou un admin
    if (req.user.role !== 'admin' && article.vendeur.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé à supprimer cet article' });
    }
    if (
      req.user.role === 'vendeur' &&
      (article.type || '').toString().toLowerCase() === 'piece'
    ) {
      const allowed = await hasSellerPieceAccess(req.user._id);
      if (!allowed) {
        return res.status(403).json({
          message:
            "Abonnement requis: votre periode gratuite est expiree. Activez un plan pour gerer vos pieces.",
        });
      }
    }
    await article.deleteOne();
    res.json({ message: 'Article supprimé' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'article', error });
  }
};

// Mettre à jour le stock (rupture / disponible) — vendeur ou admin
exports.updateStockStatus = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    if (req.user.role !== 'admin' && article.vendeur.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé à modifier le stock de cet article' });
    }
    const { stockStatus } = req.body;
    if (!['disponible', 'rupture'].includes(stockStatus)) {
      return res.status(400).json({ message: 'stockStatus doit être "disponible" ou "rupture"' });
    }
    article.stockStatus = stockStatus;
    await article.save();
    res.json({ message: 'Stock mis à jour', article: withVideoTransforms(article) });
  } catch (error) {
    console.error('Erreur updateStockStatus:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du stock', error });
  }
};

// Changer le statut d'un article (admin uniquement)
exports.updateStatut = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un admin peut changer le statut' });
    }
    const allowedStatus = ['en_attente', 'en_ligne', 'rejeté', 'vendu', 'non_vendu'];
    const nextStatut = req.body.statut;
    if (!allowedStatus.includes(nextStatut)) {
      return res.status(400).json({ message: 'Statut non autorisé' });
    }

    const raison = (req.body.raison || req.body.motifRejet || '').toString().trim();
    if (nextStatut === 'rejeté' && !raison) {
      return res.status(400).json({ message: 'Le motif de rejet est obligatoire' });
    }

    const previousStatut = article.statut;
    article.statut = nextStatut;
    if (nextStatut === 'rejeté') {
      article.motifRejet = raison;
      article.dateRejet = new Date();
    } else {
      article.motifRejet = null;
      article.dateRejet = null;
    }

    if (!article.vendeur) {
      const original = await Article.findById(req.params.id).lean();
      article.vendeur = original?.vendeur || null;
    }

    if (nextStatut === 'en_ligne' && previousStatut !== 'en_ligne') {
      initAutoViewsSchedule(article, { resetTimer: true });
    }

    await article.save();

    if (
      nextStatut === 'en_ligne' &&
      previousStatut !== 'en_ligne' &&
      !article.alertContext?.buyerId
    ) {
      const sellerId =
        article.vendeur?.toString?.() ||
        (article.vendeur ? String(article.vendeur) : null);
      if (sellerId) {
        scheduleNewArticleSideEffects(article, sellerId);
      }
    }

    if (nextStatut === 'en_ligne' && previousStatut !== 'en_ligne' && isAlertProposalArticle(article)) {
      const sellerId =
        article.vendeur?.toString?.() ||
        (article.vendeur ? String(article.vendeur) : req.user._id.toString());
      await notifyBuyerAlertProposal(article, sellerId);
    }

    if (nextStatut === 'rejeté' && article.vendeur) {
      try {
        const notificationController = require('./notificationController');
        const isPiece = (article.type || '').toString().toLowerCase() === 'piece';
        const isMoto = (article.type || '').toString().toLowerCase() === 'moto';
        const articleType = isPiece ? 'piece' : isMoto ? 'moto' : 'vehicle';
        const i18n = {
          titleKey: 'article.rejected.title',
          messageKey: 'article.rejected.message',
          params: {
            articleType,
            articleTitle: article.titre || '',
            motifRejet: raison,
          },
        };
        const { buildNotificationContent } = require('../utils/notificationI18n');
        const { title, message } = buildNotificationContent(i18n);
        await notificationController.createNotification(
          article.vendeur,
          req.user._id,
          title,
          message,
          'general',
          article._id,
          'Article',
          {
            action: 'article_rejected',
            motifRejet: raison,
            articleTitle: article.titre || '',
            articleType: article.type || '',
            targetPath: isPiece ? 'mastervac' : isMoto ? 'moto_info' : 'cars_info',
            targetArticleId: article._id.toString(),
          },
          i18n
        );
      } catch (notifError) {
        console.error('[ARTICLE] Erreur notification vendeur rejet:', notifError);
      }
    }

    res.json({ message: 'Statut mis à jour', article: withVideoTransforms(article) });
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du statut', error });
  }
};

// Marquer un article comme vendu
exports.markAsSold = async (req, res) => {
  try {
    const { id } = req.params;
    const { acheteurId } = req.body || {};

    const article = await Article.findById(id);
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    if (article.statutVente === 'vendu') {
      return res.status(400).json({ message: 'Article déjà vendu' });
    }

    article.statutVente = 'vendu';
    // statut publication → 'vendu' pour masquer du catalogue public
    article.statut = 'vendu';
    if (!article.dateAchat) article.dateAchat = new Date();

    // acheteurId est optionnel (admin peut marquer vendu sans connaître l'acheteur)
    if (acheteurId) {
      const mongoose = require('mongoose');
      if (mongoose.Types.ObjectId.isValid(String(acheteurId))) {
        article.acheteur = acheteurId;
      }
    }

    await article.save();

    // Émettre un event socket pour notifier en temps réel
    try {
      if (global.io) {
        global.io.emit('article-sold', {
          articleId: String(article._id),
          statut: 'vendu',
          statutVente: 'vendu',
        });
      }
    } catch (_) {}

    res.json({ message: 'Article marqué comme vendu', article });
  } catch (error) {
    console.error('[MARK_AS_SOLD] error:', error);
    res.status(500).json({ message: 'Erreur lors du marquage comme vendu', error: error.message });
  }
};

// Fonction utilitaire pour calculer le statut de livraison
function getStatutLivraison(article) {
  return article.dateLivraison ? 'Livré' : 'En cours';
}

// Endpoint pour récupérer les achats d'un acheteur (En cours ou Livré)
exports.getAchatsByAcheteur = async (req, res) => {
  try {
    const { acheteurId } = req.params;
    const articles = await Article.find({
      acheteur: acheteurId,
      statutVente: 'vendu' // On suppose qu'un achat est un article vendu
    })
      .populate('vendeur', 'nom prenoms role')
      .populate('acheteur', 'nom prenoms role');
    // Filtrer En cours/Livré et enrichir la réponse
    const achats = articles
      .filter(a => getStatutLivraison(a) === 'En cours' || getStatutLivraison(a) === 'Livré')
      .map(a => ({
        ...a.toObject(),
        statutLivraison: getStatutLivraison(a),
        personnesAffectees: [
          a.vendeur ? { nom: a.vendeur.nom, prenoms: a.vendeur.prenoms, role: a.vendeur.role } : null,
          a.acheteur ? { nom: a.acheteur.nom, prenoms: a.acheteur.prenoms, role: a.acheteur.role } : null
        ].filter(Boolean)
      }));
    res.json({ total: achats.length, achats });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des achats', error });
  }
};

// Endpoint pour éditer la date de livraison (admin uniquement)
exports.updateDateLivraison = async (req, res) => {
  try {
    const { id } = req.params;
    const { dateLivraison } = req.body;
    // Vérifier que l'utilisateur est admin (à adapter selon la logique d'auth)
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un admin peut modifier la date de livraison' });
    }
    const article = await Article.findByIdAndUpdate(id, { dateLivraison }, { new: true })
      .populate('vendeur', 'nom prenoms role')
      .populate('acheteur', 'nom prenoms role');
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    res.json({
      ...article.toObject(),
      statutLivraison: getStatutLivraison(article),
      personnesAffectees: [
        article.vendeur ? { nom: article.vendeur.nom, prenoms: article.vendeur.prenoms, role: article.vendeur.role } : null,
        article.acheteur ? { nom: article.acheteur.nom, prenoms: article.acheteur.prenoms, role: article.acheteur.role } : null
      ].filter(Boolean)
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la date de livraison', error });
  }
}; 