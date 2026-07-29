const TransitMission = require('../models/TransitMission');
const Article = require('../models/Article');
const User = require('../models/User');
const notificationController = require('./notificationController');

const MISSION_POPULATE = [
  {
    path: 'article',
    select:
      'titre description prix photos marque modele annee lieu type vendeur statutVente',
    populate: { path: 'vendeur', select: 'nom prenoms telephone entreprise' },
  },
  {
    path: 'acheteur',
    select: 'nom prenoms telephone email photo',
  },
  {
    path: 'transitaire',
    select: 'nom prenoms telephone entreprise photo',
  },
];

function formatMission(doc) {
  if (!doc) return null;
  const m = doc.toObject ? doc.toObject() : doc;
  const hasActiveTransitaire =
    m.transitaire != null &&
    ['en_cours', 'transferer'].includes(m.statut || '');
  m.canChangeTransitaire =
    m.statut === 'parcours' && !m.transitaire && m.statut !== 'annule';
  m.hasActiveTransitaire = hasActiveTransitaire;
  return m;
}

function missionTransitaireId(mission) {
  const t = mission?.transitaire;
  if (!t) return null;
  if (t._id) return String(t._id);
  return String(t);
}

/**
 * Émet un event 'transit-mission-update' au transitaire concerné via Socket.io.
 * Le transitaire reçoit l'update en temps réel pour rafraîchir sa liste.
 */
function emitTransitUpdate(mission) {
  try {
    if (!global.io || !global.userSockets) return;
    const transitaireId = missionTransitaireId(mission);
    if (!transitaireId) return;
    const socketId = global.userSockets.get(transitaireId);
    if (socketId) {
      global.io.to(socketId).emit('transit-mission-update', {
        missionId: String(mission._id),
        statut: mission.statut,
      });
    }
  } catch (_) {}
}

async function findMissionForBuyer(articleId, acheteurId) {
  return TransitMission.findOne({ article: articleId, acheteur: acheteurId });
}

exports.startParcours = async (req, res) => {
  try {
    const {
      articleId,
      articleTitre,
      modeLivraison,
      paysDestination,
      detailsSupplementaires,
    } = req.body;
    if (!articleId) {
      return res.status(400).json({ message: 'articleId est requis' });
    }

    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({ message: 'Article introuvable' });
    }

    const resolvedTitle =
      (articleTitre && String(articleTitre).trim()) ||
      article.titre ||
      `${article.marque || ''} ${article.modele || ''}`.trim() ||
      null;

    const acheteurId = req.user._id;
    let mission = await findMissionForBuyer(articleId, acheteurId);

    if (mission) {
      if (mission.statut === 'annule') {
        return res.status(400).json({
          code: 'ACHAT_ANNULE',
          message: 'Cet achat a été annulé',
        });
      }
      if (modeLivraison) mission.modeLivraison = modeLivraison;
      if (paysDestination !== undefined) mission.paysDestination = paysDestination;
      if (detailsSupplementaires !== undefined) {
        mission.detailsSupplementaires = detailsSupplementaires;
      }
      if (resolvedTitle) mission.articleTitre = resolvedTitle;
      await mission.save();
    } else {
      mission = await TransitMission.create({
        article: articleId,
        acheteur: acheteurId,
        statut: 'parcours',
        modeLivraison: modeLivraison || 'transit',
        paysDestination: paysDestination || null,
        detailsSupplementaires: detailsSupplementaires || null,
        articleTitre: resolvedTitle,
      });
    }

    const populated = await TransitMission.findById(mission._id).populate(
      MISSION_POPULATE,
    );
    res.status(201).json(formatMission(populated));
  } catch (error) {
    console.error('[TRANSIT_MISSION] startParcours:', error);
    res.status(500).json({ message: 'Erreur lors du démarrage du parcours' });
  }
};

exports.selectTransitaire = async (req, res) => {
  try {
    const { articleId, transitaireId } = req.body;
    if (!articleId || !transitaireId) {
      return res
        .status(400)
        .json({ message: 'articleId et transitaireId sont requis' });
    }

    const transitaire = await User.findOne({
      _id: transitaireId,
      role: 'transitaire',
    });
    if (!transitaire) {
      return res.status(404).json({ message: 'Transitaire introuvable' });
    }

    const acheteurId = req.user._id;
    let mission = await findMissionForBuyer(articleId, acheteurId);

    if (!mission) {
      return res.status(400).json({
        message:
          'Complétez le mode de livraison et la destination avant de choisir un transitaire',
      });
    }
    if (!mission.paysDestination || !String(mission.paysDestination).trim()) {
      return res.status(400).json({
        message: 'Indiquez le pays de destination avant de choisir un transitaire',
      });
    }
    if (['traite', 'annule'].includes(mission.statut)) {
      return res
        .status(400)
        .json({ message: 'Ce parcours est déjà terminé ou annulé' });
    }
    if (
      mission.transitaire &&
      ['en_cours', 'transferer'].includes(mission.statut)
    ) {
      return res.status(400).json({
        code: 'TRANSITAIRE_ACTIF',
        message:
          'Un transitaire est déjà actif pour cet achat. Attendez son refus ou consultez l\'historique.',
      });
    }

    mission.transitaire = transitaireId;
    mission.statut = 'en_cours';
    mission.dateSelectionTransitaire = new Date();
    await mission.save();

    const populated = await TransitMission.findById(mission._id).populate(
      MISSION_POPULATE,
    );

    // Notif socket temps réel au transitaire
    emitTransitUpdate(populated || mission);

    try {
      const articleTitle =
        populated?.articleTitre ||
        populated?.article?.titre ||
        populated?.article?.marque ||
        'Véhicule';
      const acheteurNom =
        `${populated?.acheteur?.prenoms ?? ''} ${populated?.acheteur?.nom ?? ''}`.trim() ||
        'Un acheteur';
      const transitaireRecipient =
        populated?.transitaire?._id || mission.transitaire;
      await notificationController.createNotification(
        transitaireRecipient,
        acheteurId,
        'Nouvelle mission de transit',
        `${acheteurNom} vous a choisi pour le transit du véhicule « ${articleTitle} » vers ${mission.paysDestination}.`,
        'transit_selection',
        mission.article,
        'Article',
        {
          missionId: String(mission._id),
          statut: 'en_cours',
          articleId: String(mission.article),
          paysDestination: mission.paysDestination || '',
          modeLivraison: mission.modeLivraison || 'transit',
        },
      );
    } catch (notifErr) {
      console.warn(
        '[TRANSIT_MISSION] Notification sélection transitaire:',
        notifErr.message,
      );
    }

    res.json(formatMission(populated));
  } catch (error) {
    console.error('[TRANSIT_MISSION] selectTransitaire:', error);
    res
      .status(500)
      .json({ message: 'Erreur lors de la sélection du transitaire' });
  }
};

exports.transfererMission = async (req, res) => {
  try {
    const { articleId } = req.body;
    if (!articleId) {
      return res.status(400).json({ message: 'articleId est requis' });
    }

    const mission = await findMissionForBuyer(articleId, req.user._id);
    if (!mission) {
      return res.status(404).json({ message: 'Parcours introuvable' });
    }
    if (!mission.transitaire) {
      return res
        .status(400)
        .json({ message: 'Aucun transitaire sélectionné pour ce véhicule' });
    }
    if (mission.statut === 'traite') {
      return res.status(400).json({ message: 'Mission déjà traitée' });
    }

    mission.statut = 'transferer';
    mission.dateTransfer = new Date();
    mission.verificationApproved = true;
    await mission.save();

    const populated = await TransitMission.findById(mission._id).populate(
      MISSION_POPULATE,
    );

    // Notif socket temps réel au transitaire
    emitTransitUpdate(populated || mission);

    try {
      const articleTitle =
        populated?.article?.titre || populated?.article?.marque || 'Véhicule';
      await notificationController.createNotification(
        mission.transitaire,
        req.user._id,
        'Nouveau transfert',
        `Le véhicule « ${articleTitle} » vous a été transféré après validation de la vérification.`,
        'transit_transfer',
        mission.article,
        'Article',
        { missionId: String(mission._id), statut: 'transferer' },
      );
    } catch (notifErr) {
      console.warn('[TRANSIT_MISSION] Notification transfert:', notifErr.message);
    }

    res.json(formatMission(populated));
  } catch (error) {
    console.error('[TRANSIT_MISSION] transfererMission:', error);
    res.status(500).json({ message: 'Erreur lors du transfert' });
  }
};

exports.transfererByArticleAndAcheteur = async (articleId, acheteurId) => {
  const mission = await TransitMission.findOne({
    article: articleId,
    acheteur: acheteurId,
    transitaire: { $ne: null },
    statut: { $in: ['parcours', 'en_cours'] },
  });
  if (!mission) return null;

  mission.statut = 'transferer';
  mission.dateTransfer = new Date();
  mission.verificationApproved = true;
  await mission.save();

  // Notif socket temps réel au transitaire
  emitTransitUpdate(mission);

  try {
    const art = await Article.findById(articleId).select('titre marque').lean();
    const articleTitle = art?.titre || art?.marque || 'Véhicule';
    await notificationController.createNotification(
      mission.transitaire,
      acheteurId,
      'Nouveau transfert',
      `Le véhicule « ${articleTitle} » vous a été transféré après validation de la vérification.`,
      'transit_transfer',
      articleId,
      'Article',
      { missionId: String(mission._id), statut: 'transferer' },
    );
  } catch (_) {}

  return mission;
};

exports.rejeterAttribution = async (req, res) => {
  try {
    const mission = await TransitMission.findById(req.params.id);
    if (!mission) {
      return res.status(404).json({ message: 'Mission introuvable' });
    }
    if (String(missionTransitaireId(mission)) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }
    if (mission.statut !== 'en_cours') {
      return res.status(400).json({
        message: 'Seules les missions en cours peuvent être refusées',
      });
    }

    const articleTitle =
      mission.articleTitre ||
      mission.article?.titre ||
      mission.article?.marque ||
      'Véhicule';
    const acheteurId = mission.acheteur?._id || mission.acheteur;
    const articleId = mission.article?._id || mission.article;

    mission.transitaire = null;
    mission.statut = 'parcours';
    mission.dateSelectionTransitaire = null;
    await mission.save();

    try {
      const { buildNotificationContent } = require('../utils/notificationI18n');
      const rejectedI18n = buildNotificationContent({
        titleKey: 'transit.rejected.title',
        messageKey: 'transit.rejected.message',
        params: { articleTitle },
      });
      await notificationController.createNotification(
        acheteurId,
        req.user._id,
        rejectedI18n.title,
        rejectedI18n.message,
        'transit_rejected',
        articleId,
        'Article',
        {
          missionId: String(mission._id),
          articleId: String(articleId),
          action: 'open_purchase_history',
        },
        {
          titleKey: 'transit.rejected.title',
          messageKey: 'transit.rejected.message',
          params: { articleTitle },
        },
        [
          {
            label: 'Voir l\'historique',
            action: 'open_purchase_history',
            color: 'primary',
          },
        ],
      );
    } catch (notifErr) {
      console.warn('[TRANSIT_MISSION] Notification refus:', notifErr.message);
    }

    const populated = await TransitMission.findById(mission._id).populate(
      MISSION_POPULATE,
    );
    // L'acheteur reçoit le refus (pas besoin de notif socket côté transitaire ici)
    res.json(formatMission(populated));
  } catch (error) {
    console.error('[TRANSIT_MISSION] rejeterAttribution:', error);
    res.status(500).json({ message: 'Erreur lors du refus de la mission' });
  }
};

exports.marquerTraite = async (req, res) => {
  try {
    const mission = await TransitMission.findById(req.params.id);
    if (!mission) {
      return res.status(404).json({ message: 'Mission introuvable' });
    }
    if (String(mission.transitaire) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }
    if (mission.statut !== 'transferer') {
      return res
        .status(400)
        .json({ message: 'Seules les missions transférées peuvent être traitées' });
    }

    mission.statut = 'traite';
    mission.dateTraite = new Date();
    await mission.save();

    const populated = await TransitMission.findById(mission._id).populate(
      MISSION_POPULATE,
    );
    // Le transitaire vient de traiter sa propre mission, on confirme le changement à tous ses clients connectés
    emitTransitUpdate(populated || mission);
    res.json(formatMission(populated));
  } catch (error) {
    console.error('[TRANSIT_MISSION] marquerTraite:', error);
    res.status(500).json({ message: 'Erreur lors de la clôture de la mission' });
  }
};

exports.getParcours = async (req, res) => {
  try {
    const { articleId } = req.params;
    const mission = await TransitMission.findOne({
      article: articleId,
      acheteur: req.user._id,
    }).populate(MISSION_POPULATE);

    if (!mission) {
      return res.status(404).json({ message: 'Aucun parcours en cours' });
    }
    res.json(formatMission(mission));
  } catch (error) {
    console.error('[TRANSIT_MISSION] getParcours:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération du parcours' });
  }
};

exports.listMesParcours = async (req, res) => {
  try {
    if (req.user.role !== 'acheteur') {
      return res.status(403).json({ message: 'Réservé aux acheteurs' });
    }
    const missions = await TransitMission.find({ acheteur: req.user._id })
      .sort({ updatedAt: -1 })
      .populate(MISSION_POPULATE);
    res.json(missions.map(formatMission));
  } catch (error) {
    console.error('[TRANSIT_MISSION] listMesParcours:', error);
    res.status(500).json({
      message: 'Erreur lors du chargement de l\'historique des achats',
    });
  }
};

exports.annulerApresVerificationRejetee = async (articleId, acheteurId) => {
  const mission = await TransitMission.findOne({
    article: articleId,
    acheteur: acheteurId,
    transitaire: { $ne: null },
    statut: { $in: ['en_cours', 'transferer', 'parcours'] },
  });
  if (!mission) return null;

  const transitaireId = mission.transitaire;
  mission.statut = 'annule';
  mission.dateAnnulation = new Date();
  await mission.save();

  try {
    const { buildNotificationContent } = require('../utils/notificationI18n');
    const articleTitle =
      mission.articleTitre ||
      (await Article.findById(articleId).select('titre marque').lean())?.titre ||
      'Véhicule';
    const cancelledI18n = buildNotificationContent({
      titleKey: 'transit.purchaseCancelled.title',
      messageKey: 'transit.purchaseCancelled.message',
      params: { articleTitle },
    });
    await notificationController.createNotification(
      transitaireId,
      acheteurId,
      cancelledI18n.title,
      cancelledI18n.message,
      'transit_purchase_cancelled',
      articleId,
      'Article',
      {
        missionId: String(mission._id),
        articleId: String(articleId),
        statut: 'annule',
      },
      {
        titleKey: 'transit.purchaseCancelled.title',
        messageKey: 'transit.purchaseCancelled.message',
        params: { articleTitle },
      },
    );
  } catch (notifErr) {
    console.warn(
      '[TRANSIT_MISSION] Notification annulation achat:',
      notifErr.message,
    );
  }

  return mission;
};

exports.listMesMissions = async (req, res) => {
  try {
    if (req.user.role !== 'transitaire') {
      return res.status(403).json({ message: 'Réservé aux transitaires' });
    }

    const { statut } = req.query;
    const allowed = ['en_cours', 'transferer', 'traite', 'annule'];
    if (!statut || !allowed.includes(statut)) {
      return res
        .status(400)
        .json({ message: 'statut requis: en_cours, transferer, traite ou annule' });
    }

    const missions = await TransitMission.find({
      transitaire: req.user._id,
      statut,
    })
      .sort({ updatedAt: -1 })
      .populate(MISSION_POPULATE);

    res.json(missions.map(formatMission));
  } catch (error) {
    console.error('[TRANSIT_MISSION] listMesMissions:', error);
    res.status(500).json({ message: 'Erreur lors du chargement des missions' });
  }
};

exports.updateDetails = async (req, res) => {
  try {
    const mission = await TransitMission.findById(req.params.id);
    if (!mission) {
      return res.status(404).json({ message: 'Mission introuvable' });
    }
    if (String(mission.transitaire) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const { paysDestination, detailsSupplementaires } = req.body;
    if (paysDestination !== undefined) {
      mission.paysDestination = paysDestination || null;
    }
    if (detailsSupplementaires !== undefined) {
      mission.detailsSupplementaires = detailsSupplementaires || null;
    }
    await mission.save();

    const populated = await TransitMission.findById(mission._id).populate(
      MISSION_POPULATE,
    );
    res.json(formatMission(populated));
  } catch (error) {
    console.error('[TRANSIT_MISSION] updateDetails:', error);
    res
      .status(500)
      .json({ message: 'Erreur lors de la mise à jour de la mission' });
  }
};

exports.listAcceptes = async (req, res) => {
  try {
    if (req.user.role !== 'transitaire') {
      return res.status(403).json({ message: 'Réservé aux transitaires' });
    }

    const missions = await TransitMission.find({
      transitaire: req.user._id,
      statut: { $in: ['en_cours', 'transferer', 'traite', 'annule'] },
    })
      .sort({ updatedAt: -1 })
      .populate(MISSION_POPULATE);

    res.json(missions.map(formatMission));
  } catch (error) {
    console.error('[TRANSIT_MISSION] listAcceptes:', error);
    res.status(500).json({ message: 'Erreur lors du chargement' });
  }
};
