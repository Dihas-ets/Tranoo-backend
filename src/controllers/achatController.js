const Achat = require('../models/Achat');
const Article = require('../models/Article');
const PropositionTransit = require('../models/PropositionTransit');

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
    return res.status(201).json({ message: 'Achat enregistré', achat });
  } catch (error) {
    console.error('[createAchat] Erreur:', error);
    return res.status(500).json({ message: 'Erreur enregistrement achat', error });
  }
};


