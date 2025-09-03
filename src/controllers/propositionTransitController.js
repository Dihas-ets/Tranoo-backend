const PropositionTransit = require('../models/PropositionTransit');
const Article = require('../models/Article');

// Créer ou mettre à jour une proposition (upsert par article+transitaire)
exports.upsertProposition = async (req, res) => {
  try {
    const { articleId, montant } = req.body;
    console.log('[upsertProposition] Données reçues:', { articleId, montant });
    
    if (!articleId || montant == null) {
      return res.status(400).json({ message: 'articleId et montant requis' });
    }

    // Vérifier article en_ligne ou en_attente et non vendu
    const article = await Article.findById(articleId);
    console.log('[upsertProposition] Article trouvé:', article ? article._id : 'non trouvé');
    
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    if ((article.statut !== 'en_ligne' && article.statut !== 'en_attente') || article.statutVente === 'vendu') {
      console.log('[upsertProposition] Article non éligible:', { statut: article.statut, statutVente: article.statutVente });
      return res.status(400).json({ message: 'Article non éligible' });
    }

    const transitaireId = req.user._id;
    console.log('[upsertProposition] Transitaire ID:', transitaireId);
    
    const proposition = await PropositionTransit.findOneAndUpdate(
      { article: articleId, transitaire: transitaireId },
      { $set: { montant, statut: 'soumis' } },
      { new: true, upsert: true }
    );
    
    console.log('[upsertProposition] Proposition enregistrée:', proposition._id);
    res.json({ message: 'Proposition enregistrée', proposition });
  } catch (error) {
    console.error('[upsertProposition] Erreur:', error);
    res.status(500).json({ message: 'Erreur enregistrement proposition', error });
  }
};

// Lister articles en ligne non vendus (Soumis)
// Exclure ceux pour lesquels le transitaire connecté a déjà proposé un tarif
exports.listSoumis = async (req, res) => {
  try {
    const transitaireId = req.user._id;
    // Récupérer les articles déjà proposés par ce transitaire (peu importe le statut)
    const dejaProposesArticleIds = await PropositionTransit.find({ transitaire: transitaireId })
      .distinct('article');

    const articles = await Article.find({
      statut: 'en_ligne',
      statutVente: { $ne: 'vendu' },
      _id: { $nin: dejaProposesArticleIds }
    });
    res.json(articles);
  } catch (error) {
    res.status(500).json({ message: 'Erreur liste Soumis', error });
  }
};

// Lister articles où le transitaire a soumis une proposition (Soumettre)
exports.listSoumettre = async (req, res) => {
  try {
    const transitaireId = req.user._id;
    const propositions = await PropositionTransit.find({ transitaire: transitaireId })
      .populate('article')
      .lean();
    const items = propositions
      .filter(p => p.article)
      .map(p => ({ ...p.article, montant: p.montant }));
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Erreur liste Soumettre', error });
  }
};

// Lister articles avec proposition et statutVente = en_attente (Validés)
exports.listValides = async (req, res) => {
  try {
    const transitaireId = req.user._id;
    const propositions = await PropositionTransit.find({ transitaire: transitaireId })
      .populate('article')
      .lean();
    const items = propositions
      .filter(p => p.article && p.article.statutVente === 'en_attente')
      .map(p => ({ ...p.article, montant: p.montant }));
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Erreur liste Validés', error });
  }
};

// Archiver une proposition
exports.archiveProposition = async (req, res) => {
  try {
    const { articleId } = req.body;
    if (!articleId) return res.status(400).json({ message: 'articleId requis' });
    const transitaireId = req.user._id;
    const proposition = await PropositionTransit.findOneAndUpdate(
      { article: articleId, transitaire: transitaireId },
      { $set: { statut: 'archive' } },
      { new: true }
    );
    if (!proposition) return res.status(404).json({ message: 'Proposition non trouvée' });
    res.json({ message: 'Proposition archivée', proposition });
  } catch (error) {
    res.status(500).json({ message: 'Erreur archivage', error });
  }
};

// Valider une proposition (le transitaire accepte)
exports.validerProposition = async (req, res) => {
  try {
    const { articleId } = req.body;
    if (!articleId) return res.status(400).json({ message: 'articleId requis' });
    const transitaireId = req.user._id;
    const proposition = await PropositionTransit.findOneAndUpdate(
      { article: articleId, transitaire: transitaireId },
      { $set: { statut: 'valide' } },
      { new: true }
    );
    if (!proposition) return res.status(404).json({ message: 'Proposition non trouvée' });
    res.json({ message: 'Proposition validée', proposition });
  } catch (error) {
    res.status(500).json({ message: 'Erreur validation', error });
  }
};

// Récupérer toutes les propositions pour un article spécifique (pour l'acheteur)
exports.getPropositionsForArticle = async (req, res) => {
  try {
    const { articleId } = req.params;
    console.log('[getPropositionsForArticle] Recherche propositions pour articleId:', articleId);
    
    if (!articleId) return res.status(400).json({ message: 'articleId requis' });
    
    const propositions = await PropositionTransit.find({ 
      article: articleId,
      statut: { $in: ['soumis', 'valide'] } // Seulement les propositions actives
    })
    .populate('transitaire', 'nom entreprise email telephone')
    .populate('article', 'titre description photos')
    .lean();
    
    console.log('[getPropositionsForArticle] Propositions trouvées:', propositions.length);
    console.log('[getPropositionsForArticle] Détails propositions:', propositions);
    
    res.json(propositions);
  } catch (error) {
    console.error('[getPropositionsForArticle] Erreur:', error);
    res.status(500).json({ message: 'Erreur récupération propositions', error });
  }
};

// Archives: propositions du transitaire au statut archive, article accepté (en_attente)
exports.listArchives = async (req, res) => {
  try {
    const transitaireId = req.user._id;
    const propositions = await PropositionTransit.find({ transitaire: transitaireId, statut: 'archive' })
      .populate('article')
      .lean();
    const items = propositions
      .filter(p => p.article && p.article.statutVente === 'en_attente')
      .map(p => ({ ...p.article, montant: p.montant }));
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Erreur liste archives', error });
  }
};

// Acceptés (transit): propositions validées par le transitaire, article accepté (en_attente)
exports.listAcceptes = async (req, res) => {
  try {
    const transitaireId = req.user._id;
    const propositions = await PropositionTransit.find({ transitaire: transitaireId, statut: 'valide' })
      .populate('article')
      .lean();
    const items = propositions
      .filter(p => p.article && p.article.statutVente === 'en_attente')
      .map(p => ({ ...p.article, montant: p.montant }));
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Erreur liste acceptés', error });
  }
};


