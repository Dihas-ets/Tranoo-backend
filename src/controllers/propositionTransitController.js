// Obsolète: Transit - contrôleur désactivé (fonction obsolète)
// const PropositionTransit = require('../models/PropositionTransit');
// const Article = require('../models/Article');

// Créer ou mettre à jour une proposition (upsert par article+transitaire)
exports.upsertProposition = async (_req, res) => res.status(410).json({ message: 'fonction obsolète' });

// Lister articles en ligne non vendus (Soumis)
// Exclure ceux pour lesquels le transitaire connecté a déjà proposé un tarif
exports.listSoumis = async (_req, res) => res.status(410).json({ message: 'fonction obsolète' });

// Lister articles où le transitaire a soumis une proposition (Soumettre)
exports.listSoumettre = async (_req, res) => res.status(410).json({ message: 'fonction obsolète' });

// Lister articles avec proposition et statutVente = en_attente (Validés)
exports.listValides = async (_req, res) => res.status(410).json({ message: 'fonction obsolète' });

// Archiver une proposition
exports.archiveProposition = async (_req, res) => res.status(410).json({ message: 'fonction obsolète' });

// Valider une proposition (le transitaire accepte)
exports.validerProposition = async (_req, res) => res.status(410).json({ message: 'fonction obsolète' });

// Récupérer toutes les propositions pour un article spécifique (pour l'acheteur)
exports.getPropositionsForArticle = async (_req, res) => res.status(410).json({ message: 'fonction obsolète' });

// Archives: propositions du transitaire au statut archive, article accepté (en_attente)
exports.listArchives = async (_req, res) => res.status(410).json({ message: 'fonction obsolète' });

// Acceptés (transit): propositions validées par le transitaire, article accepté (en_attente)
exports.listAcceptes = async (_req, res) => res.status(410).json({ message: 'fonction obsolète' });


