const Achat = require('../models/Achat');
const Article = require('../models/Article');
const PropositionTransit = require('../models/PropositionTransit');
const User = require('../models/User');
const notificationController = require('./notificationController');

exports.createAchat = async (req, res) => {
  try {
    const {
      articleId,
      propositionTransitId,
      modeLivraison,
      paysDestination,
      detailsSupplementaires,
      services,
      pieceType,
      pieceNumero,
      fichierNom,
      fichierUrl,
    } = req.body;

    if (!articleId || !modeLivraison) {
      return res.status(400).json({ message: 'articleId et modeLivraison requis' });
    }

    const article = await Article.findById(articleId);
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });

    let proposition = null;
    if (propositionTransitId) {
      proposition = await PropositionTransit.findById(propositionTransitId);
    }

    const acheteur = req.user?._id?.toString() || req.body.acheteur; // fallback si jamais

    const achat = new Achat({
      acheteur,
      article: articleId,
      propositionTransit: propositionTransitId || undefined,
      modeLivraison,
      paysDestination,
      detailsSupplementaires,
      services,
      pieceType,
      pieceNumero,
      fichierNom,
      fichierUrl,
      tarifTransitaire: proposition ? proposition.montant : undefined,
    });

    await achat.save();
    // Notifier automatiquement les admins en cas d'approbation (achat créé)
    try {
      const title = `Achat validé: ${article.titre || article.title || article.nom || ''}`.trim();
      const message = [
        `Article: ${(article.titre || article.title || article.nom || article._id).toString()}`,
        proposition ? `Transitaire: ${proposition.nom || proposition.entreprise || proposition._id}` : null,
        proposition ? `Tarif: ${proposition.montant}` : null,
        paysDestination ? `Destination: ${paysDestination}` : null,
        modeLivraison ? `Mode: ${modeLivraison}` : null,
        services ? `Services: ${JSON.stringify(services)}` : null,
      ].filter(Boolean).join(' | ');

      const adminRoles = ['admin', 'superAdmin', 'principal', 'gestionnaire'];
      const admins = await User.find({ role: { $in: adminRoles } }).select('_id');
      for (const adminUser of admins) {
        await notificationController.createNotification(
          adminUser._id,
          acheteur,
          title || 'Achat validé',
          message || 'Un achat a été validé',
          'paiement',
          achat._id,
          'Achat'
        );
      }
    } catch (e) {
      console.error('[ACHAT] Impossible d\'envoyer la notification admin:', e?.message || e);
    }

    return res.status(201).json({ message: 'Achat enregistré', achat });
  } catch (error) {
    console.error('[createAchat] Erreur:', error);
    return res.status(500).json({ message: 'Erreur enregistrement achat', error });
  }
};

exports.createBulkAchats = async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items requis' });
    }
    const acheteur = req.user?._id?.toString() || req.body.acheteur;

    const results = [];
    for (const it of items) {
      const {
        articleId,
        propositionTransitId,
        modeLivraison,
        paysDestination,
        detailsSupplementaires,
        services,
        pieceType,
        pieceNumero,
        fichierNom,
        fichierUrl,
        quantity,
      } = it || {};
      if (!articleId || !modeLivraison) continue;
      const article = await Article.findById(articleId);
      if (!article) continue;
      let proposition = null;
      if (propositionTransitId) {
        proposition = await PropositionTransit.findById(propositionTransitId);
      }
      const achat = new Achat({
        acheteur,
        article: articleId,
        propositionTransit: propositionTransitId || undefined,
        modeLivraison,
        paysDestination,
        detailsSupplementaires,
        services,
        pieceType,
        pieceNumero,
        fichierNom,
        fichierUrl,
        quantite: quantity || 1,
        tarifTransitaire: proposition ? proposition.montant : undefined,
      });
      await achat.save();
      results.push(achat);
    }

    return res.status(201).json({ message: 'Achats enregistrés', count: results.length, achats: results });
  } catch (error) {
    console.error('[createBulkAchats] Erreur:', error);
    return res.status(500).json({ message: 'Erreur enregistrement achats', error });
  }
};


