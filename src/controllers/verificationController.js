const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Article = require('../models/Article');
const User = require('../models/User');

// ─── Rôles admin autorisés ───────────────────────────────────────────────────
const ADMIN_ROLES = new Set([
  'admin', 'superAdmin', 'principal', 'gestionnaire', 'moderateur',
  'responsablePaiement', 'responsableService', 'responsablePartenaires',
]);

function isAdmin(user) {
  if (!user) return false;
  return ADMIN_ROLES.has(String(user.role || '')) || ADMIN_ROLES.has(String(user.typeAdmin || ''));
}

function extractArticleIdFromTransKey(transKey) {
  const m = String(transKey || '').match(/VERIFICATION_([a-f0-9]{24})_/i);
  return m?.[1] || null;
}

/**
 * Après paiement FeexPay : confirme la demande de vérification (paiement déjà enregistré via /payments/feexpay/flutter/record).
 */
exports.requestVerification = async (req, res) => {
  try {
    const { articleId, transKey, amount } = req.body || {};
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentification requise' });
    }

    const articleIdFromKey = extractArticleIdFromTransKey(transKey);
    const resolvedArticleId = articleId || articleIdFromKey;

    if (!resolvedArticleId || !mongoose.Types.ObjectId.isValid(resolvedArticleId)) {
      return res.status(400).json({
        success: false,
        message: 'articleId invalide ou manquant',
      });
    }

    const article = await Article.findById(resolvedArticleId).select('_id titre type');
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article introuvable' });
    }

    const userKeys = [userId, String(userId)];
    const orLookup = [
      {
        status: 'success',
        type: 'verification',
        user: { $in: userKeys },
        customId: new RegExp(`VERIFICATION_${resolvedArticleId}`, 'i'),
      },
    ];
    if (transKey) {
      orLookup.push({
        status: 'success',
        type: 'verification',
        user: { $in: userKeys },
        customId: String(transKey).trim(),
      });
      orLookup.push({
        status: 'success',
        type: 'verification',
        user: { $in: userKeys },
        'rawInitResponse.transKey': String(transKey).trim(),
      });
    }

    let payment = await Payment.findOne({ $or: orLookup }).sort({ createdAt: -1 });

    if (!payment && transKey) {
      payment = await Payment.findOne({
        user: { $in: userKeys },
        type: 'verification',
        $or: [
          { customId: String(transKey).trim() },
          { transactionId: String(transKey).trim() },
        ],
      }).sort({ createdAt: -1 });
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          'Paiement de vérification introuvable. Attendez quelques secondes et réessayez, ou contactez le support.',
      });
    }

    if (payment.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: 'Le paiement n\'est pas encore confirmé',
        paymentId: String(payment._id),
        status: payment.status,
      });
    }

    const expectedCustomId =
      transKey && String(transKey).startsWith('VERIFICATION_')
        ? String(transKey).trim()
        : `VERIFICATION_${resolvedArticleId}_${Date.now()}`;

    if (!payment.customId || !String(payment.customId).includes(resolvedArticleId)) {
      payment.customId = expectedCustomId;
    }
    payment.description =
      payment.description || `Frais vérification — ${article.titre || 'véhicule'}`;
    if (amount != null && Number(amount) > 0) {
      payment.amount = Number(amount);
    }
    await payment.save();

    // Incrémenter le compteur de vérifications sur l'article
    // Ne pas réinitialiser verificationStatut si l'article est déjà vendu
    const articleDoc = await Article.findById(resolvedArticleId).select('statut statutVente verificationStatut').lean();
    const isAlreadySold = articleDoc?.statut === 'vendu' || articleDoc?.statutVente === 'vendu';

    if (!isAlreadySold) {
      await Article.findByIdAndUpdate(resolvedArticleId, {
        $set: {
          verificationStatut: 'en_attente',
          verificationPaymentId: payment._id,
          verificationMotifRefus: null,
        },
        $inc: { verificationCount: 1 },
      });
    } else {
      // Article vendu : on incrémente juste le compteur sans changer le statut
      await Article.findByIdAndUpdate(resolvedArticleId, {
        $inc: { verificationCount: 1 },
      });
    }

    console.log('[VERIFICATION][REQUEST] OK', {
      paymentId: String(payment._id),
      articleId: String(resolvedArticleId),
      userId: String(userId),
    });

    // Notifier le vendeur de la demande de vérification
    try {
      const notificationController = require('./notificationController');
      const { formatTemplate } = require('../utils/notificationI18n');
      const User = require('../models/User');

      const vendeurId = article.vendeur;
      if (vendeurId) {
        const vendeur = await User.findById(vendeurId)
          .select('_id nom prenoms')
          .lean();
        const vendeurPrenom = (vendeur?.prenoms || vendeur?.nom || 'Vendeur').toString().trim();
        const articleTitle = article.titre || 'Votre véhicule';

        const notifTitle = formatTemplate(
          'verification.vendor.request.title',
          'fr',
          { articleTitle }
        );
        const notifMessage = formatTemplate(
          'verification.vendor.request.message',
          'fr',
          { vendeurPrenom, articleTitle }
        );

        await notificationController.createNotification(
          vendeurId,
          userId,
          notifTitle,
          notifMessage,
          'general',
          resolvedArticleId,
          'Article',
          { articleId: String(resolvedArticleId), articleTitle },
          {
            titleKey: 'verification.vendor.request.title',
            messageKey: 'verification.vendor.request.message',
            params: { vendeurPrenom, articleTitle },
          }
        );
        console.log('[VERIFICATION][VENDOR_NOTIF] envoyée à', String(vendeurId));
      }
    } catch (notifErr) {
      // Ne jamais bloquer la réponse principale pour une notif
      console.warn('[VERIFICATION][VENDOR_NOTIF] échec:', notifErr?.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Demande de vérification enregistrée',
      paymentId: String(payment._id),
      articleId: String(resolvedArticleId),
      transactionId: payment.transactionId || null,
    });
  } catch (error) {
    console.error('[VERIFICATION][REQUEST] error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement de la demande',
      error: error.message,
    });
  }
};


// ─── ADMIN : Liste des demandes de vérification ─────────────────────────────

/**
 * GET /api/verification/admin/requests
 * Retourne la liste des voitures ayant au moins un paiement de type "verification",
 * enrichie du statut verificationStatut de l'article et du paiement associé.
 *
 * Query params:
 *  - statut : 'non_verifie' | 'en_attente' | 'verifie' | 'accepte' | 'refuse' | 'tout'
 *  - search : texte libre (titre, marque, modele, nom vendeur)
 *  - limit  : nombre max de résultats (défaut 200)
 *  - page   : numéro de page (défaut 1)
 */
exports.listVerificationRequests = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const { statut = 'tout', search = '', limit = 200, page = 1 } = req.query;
    const maxLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const currentPage = Math.max(Number(page) || 1, 1);
    const skip = (currentPage - 1) * maxLimit;

    // 1) Trouver tous les paiements de vérification (success ou pending)
    const verificationPayments = await Payment.find({
      type: 'verification',
      status: { $in: ['success', 'pending'] },
    })
      .sort({ createdAt: -1 })
      .select('_id customId transactionId user amount currency status createdAt description')
      .lean();

    // 2) Extraire les articleIds depuis customId (pattern VERIFICATION_{id}_)
    const articleIdToPayment = new Map();
    for (const p of verificationPayments) {
      const raw = String(p.customId || p.transactionId || '');
      const m = raw.match(/VERIFICATION_([a-f0-9]{24})_/i);
      const artId = m?.[1] || null;
      if (artId && !articleIdToPayment.has(artId)) {
        articleIdToPayment.set(artId, p);
      }
    }

    const articleIds = [...articleIdToPayment.keys()].map(id => new mongoose.Types.ObjectId(id));

    // 3) Construire le filtre articles
    const articleFilter = {
      _id: { $in: articleIds },
      type: 'voiture',
    };

    // Filtre par verificationStatut
    if (statut && statut !== 'tout') {
      // 'en_attente' = paiement reçu mais pas encore traité par l'admin
      // mapping frontend → champ DB
      const statutMap = {
        non_verifie: 'non_verifie',
        en_attente: 'en_attente',
        verifie: 'verifie',
        accepte: 'accepte',
        refuse: 'refuse',
      };
      if (statutMap[statut]) {
        articleFilter.verificationStatut = statutMap[statut];
      }
    }

    // Filtre recherche textuelle
    if (search && String(search).trim()) {
      const q = String(search).trim();
      const re = new RegExp(q, 'i');
      articleFilter.$or = [
        { titre: re },
        { marque: re },
        { modele: re },
        { entreprise: re },
      ];
    }

    // 4) Récupérer les articles
    const total = await Article.countDocuments(articleFilter);
    const articles = await Article.find(articleFilter)
      .sort({ dateCreation: -1 })
      .skip(skip)
      .limit(maxLimit)
      .select('_id titre marque modele annee photos statut verificationStatut verificationPaymentId verificationDate verificationMotifRefus verificationCount vendeur dateCreation')
      .lean();

    // 5) Enrichir avec infos vendeur + paiement associé
    const vendeurIds = [...new Set(articles.map(a => a.vendeur).filter(Boolean))];
    const vendeurs = await User.find({ _id: { $in: vendeurIds } })
      .select('_id nom prenoms email telephone uid')
      .lean();
    const vendeurMap = new Map(vendeurs.map(v => [String(v._id), v]));

    const result = articles.map(article => {
      const payment = articleIdToPayment.get(String(article._id));
      const vendeur = vendeurMap.get(String(article.vendeur)) || null;

      // Si l'article n'a pas encore de verificationStatut mais qu'il a un paiement success,
      // on le considère 'en_attente' (paiement reçu, vérification pas encore faite).
      let resolvedStatut = article.verificationStatut || 'non_verifie';
      if (resolvedStatut === 'non_verifie' && payment?.status === 'success') {
        resolvedStatut = 'en_attente';
      }

      return {
        articleId: String(article._id),
        titre: article.titre || '—',
        marque: article.marque || null,
        modele: article.modele || null,
        annee: article.annee || null,
        photo: article.photos?.[0] || null,
        statutArticle: article.statut,
        verificationStatut: resolvedStatut,
        verificationDate: article.verificationDate || null,
        verificationMotifRefus: article.verificationMotifRefus || null,
        vendeur: vendeur
          ? {
              id: String(vendeur._id),
              nom: `${vendeur.prenoms || ''} ${vendeur.nom || ''}`.trim() || 'Inconnu',
              email: vendeur.email || null,
              telephone: vendeur.telephone || null,
            }
          : null,
        dateCreation: article.dateCreation,
        payment: payment
          ? {
              id: String(payment._id),
              amount: payment.amount,
              currency: payment.currency || 'XOF',
              status: payment.status,
              createdAt: payment.createdAt,
              description: payment.description || null,
            }
          : null,
      };
    });

    return res.json({
      success: true,
      requests: result,
      total,
      page: currentPage,
      limit: maxLimit,
      totalPages: Math.ceil(total / maxLimit),
    });
  } catch (error) {
    console.error('[VERIFICATION][ADMIN_LIST] error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des demandes de vérification',
      error: error.message,
    });
  }
};

/**
 * PATCH /api/verification/admin/requests/:articleId/statut
 * Met à jour le verificationStatut d'un article.
 * Body: { statut: 'verifie' | 'accepte' | 'refuse', motifRefus?: string }
 */
exports.updateVerificationStatut = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    const { articleId } = req.params;
    const { statut, motifRefus } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(articleId)) {
      return res.status(400).json({ success: false, message: 'articleId invalide' });
    }

    const allowed = ['verifie', 'accepte', 'refuse', 'en_attente', 'non_verifie'];
    if (!allowed.includes(statut)) {
      return res.status(400).json({
        success: false,
        message: `Statut invalide. Valeurs acceptées : ${allowed.join(', ')}`,
      });
    }

    const update = {
      verificationStatut: statut,
      verificationDate: new Date(),
    };
    if (statut === 'refuse' && motifRefus) {
      update.verificationMotifRefus = String(motifRefus).trim();
    } else {
      update.verificationMotifRefus = null;
    }

    const article = await Article.findByIdAndUpdate(
      articleId,
      { $set: update },
      { new: true, select: '_id titre verificationStatut verificationDate verificationMotifRefus' }
    );

    if (!article) {
      return res.status(404).json({ success: false, message: 'Article introuvable' });
    }

    console.log('[VERIFICATION][ADMIN_UPDATE]', {
      articleId,
      statut,
      adminId: String(req.user._id || ''),
    });

    return res.json({
      success: true,
      message: 'Statut de vérification mis à jour',
      article: {
        id: String(article._id),
        titre: article.titre,
        verificationStatut: article.verificationStatut,
        verificationDate: article.verificationDate,
        verificationMotifRefus: article.verificationMotifRefus,
      },
    });
  } catch (error) {
    console.error('[VERIFICATION][ADMIN_UPDATE] error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du statut',
      error: error.message,
    });
  }
};

/**
 * GET /api/verification/admin/stats
 * Retourne les compteurs par statut pour les badges/sidebar.
 */
exports.getVerificationStats = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    // Compter les paiements de vérification réussis dont l'article est en_attente
    const verificationPayments = await Payment.find({
      type: 'verification',
      status: 'success',
    })
      .select('customId transactionId')
      .lean();

    const articleIds = [];
    for (const p of verificationPayments) {
      const raw = String(p.customId || p.transactionId || '');
      const m = raw.match(/VERIFICATION_([a-f0-9]{24})_/i);
      if (m?.[1]) articleIds.push(new mongoose.Types.ObjectId(m[1]));
    }

    const counts = await Article.aggregate([
      { $match: { _id: { $in: articleIds }, type: 'voiture' } },
      {
        $group: {
          _id: { $ifNull: ['$verificationStatut', 'non_verifie'] },
          count: { $sum: 1 },
        },
      },
    ]);

    const stats = { non_verifie: 0, en_attente: 0, verifie: 0, accepte: 0, refuse: 0, total: 0 };
    for (const c of counts) {
      const key = c._id || 'non_verifie';
      if (key in stats) stats[key] = c.count;
      stats.total += c.count;
    }

    // Articles avec paiement success mais verificationStatut = 'non_verifie' → comptent comme en_attente
    const nonVerifieWithPayment = await Article.countDocuments({
      _id: { $in: articleIds },
      type: 'voiture',
      $or: [
        { verificationStatut: 'non_verifie' },
        { verificationStatut: { $exists: false } },
        { verificationStatut: null },
      ],
    });
    stats.en_attente = (stats.en_attente || 0) + nonVerifieWithPayment;
    stats.non_verifie = Math.max(0, (stats.non_verifie || 0) - nonVerifieWithPayment);

    return res.json({ success: true, stats });
  } catch (error) {
    console.error('[VERIFICATION][STATS] error:', error);
    return res.status(500).json({ success: false, message: 'Erreur stats', error: error.message });
  }
};
