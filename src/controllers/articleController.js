const Article = require('../models/Article');

// Créer un article (voiture ou pièce)
exports.createArticle = async (req, res) => {
  try {
    // On suppose que req.user contient l'utilisateur authentifié (vendeur)
    const vendeurId = req.user && req.user._id ? req.user._id : req.body.vendeur;
    const article = new Article({ ...req.body, vendeur: vendeurId });
    await article.save();
    res.status(201).json({ message: 'Article créé', article });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la création de l\'article', error });
  }
};

// Lister les articles avec filtres (type, marque, modele, lieu, prix, categorie, etc.)
exports.getArticles = async (req, res) => {
  try {
    const { type, marque, modele, lieu, minPrix, maxPrix, categorie, vendeur, aLaUne, sponsorise, recommande } = req.query;
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
    if (minPrix || maxPrix) {
      filter.prix = {};
      if (minPrix) filter.prix.$gte = Number(minPrix);
      if (maxPrix) filter.prix.$lte = Number(maxPrix);
    }
    const articles = await Article.find(filter).populate('vendeur', 'nom prenoms email entreprise');
    res.json(articles);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des articles', error });
  }
};

// Détail d'un article
exports.getArticleById = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id).populate('vendeur', 'nom prenoms email entreprise');
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    res.json(article);
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
    Object.assign(article, req.body);
    await article.save();
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
    await article.deleteOne();
    res.json({ message: 'Article supprimé' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la suppression de l\'article', error });
  }
};

// Changer le statut d'un article (admin uniquement)
exports.updateStatut = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    // Vérifier que l'utilisateur est admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un admin peut changer le statut' });
    }
    article.statut = req.body.statut;
    await article.save();
    // Envoi de notification push au vendeur si fcmToken présent
    const User = require('../models/User');
    const adminSdk = require('firebase-admin');
    const vendeur = await User.findById(article.vendeur);
    if (vendeur && vendeur.fcmToken) {
      const message = {
        token: vendeur.fcmToken,
        notification: {
          title: 'Statut de votre article',
          body: `Votre article "${article.titre}" a été ${article.statut}`
        }
      };
      try {
        await adminSdk.messaging().send(message);
      } catch (notifError) {
        console.error('Erreur lors de l\'envoi de la notification FCM :', notifError);
      }
    }
    res.json({ message: 'Statut mis à jour', article });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour du statut', error });
  }
};

// Marquer un article comme vendu
exports.markAsSold = async (req, res) => {
  try {
    const { id } = req.params;
    const { acheteurId } = req.body;
    const article = await Article.findById(id);
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
    if (article.statutVente === 'vendu') return res.status(400).json({ message: 'Article déjà vendu' });
    article.statutVente = 'vendu';
    article.acheteur = acheteurId;
    await article.save();
    res.json({ message: 'Article marqué comme vendu', article });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du marquage comme vendu', error });
  }
}; 