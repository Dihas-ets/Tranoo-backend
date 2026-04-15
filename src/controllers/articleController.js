const Article = require('../models/Article');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
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

function withVideoTransforms(doc) {
  if (!doc) return doc;
  const data = doc.toObject ? doc.toObject() : doc;
  const { videoOptimized, videoThumbnail } = buildCloudinaryVideoVariants(data.video);
  return { ...data, videoOptimized, videoThumbnail };
}

async function hasSellerPieceAccess(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return false;

  const inscriptionDate = user.dateInscription || user.createdAt;
  if (inscriptionDate) {
    const trialEnd = new Date(inscriptionDate);
    trialEnd.setDate(trialEnd.getDate() + 90);
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
    // Restriction abonnement pour pièces vendeurs (trial 3 mois ou abonnement actif)
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
    // Forcer le statut à 'en_attente' à la création
    const article = new Article({ ...req.body, vendeur: vendeurId, statut: 'en_attente', source });
    await article.save();
    res.status(201).json({ message: 'Article créé', article });
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
        if ((type || '').toString().toLowerCase() !== 'piece') {
          filter.statut = 'en_ligne';
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

    // LOG DEBUG
    console.log('USER:', req.user);
    console.log('FILTER:', filter);
    const articles = await Article.find(filter).populate('vendeur', 'nom prenoms email entreprise');
    res.json(articles.map(withVideoTransforms));
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des articles', error });
  }
};

// Alias public qui réutilise la même logique que getArticles
exports.getArticlesPublic = (req, res) => exports.getArticles(req, res);

// Détail d'un article
exports.getArticleById = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id).populate('vendeur', 'nom prenoms email entreprise');
    if (!article) return res.status(404).json({ message: 'Article non trouvé' });
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
    Object.assign(article, req.body);
    // Correction : Forcer le champ source à 'tranoo' si entreprise=TRANOO
    if (req.body.entreprise && req.body.entreprise.trim().toUpperCase() === 'TRANOO') {
      article.source = 'tranoo';
    } else if (req.body.source) {
      article.source = req.body.source;
    }
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
    // Vérifier que l'utilisateur est admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un admin peut changer le statut' });
    }
    // Autoriser tous les statuts définis dans le modèle
    const allowedStatus = ['en_attente', 'en_ligne', 'rejeté', 'vendu', 'non_vendu'];
    if (!allowedStatus.includes(req.body.statut)) {
      return res.status(400).json({ message: 'Statut non autorisé' });
    }
    article.statut = req.body.statut;
    // Correction : forcer la présence du champ vendeur
    if (!article.vendeur) {
      const original = await Article.findById(req.params.id).lean();
      article.vendeur = original?.vendeur || null;
    }
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
    console.error('Erreur lors de la mise à jour du statut:', error);
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
    if (!article.dateAchat) article.dateAchat = new Date();
    await article.save();
    res.json({ message: 'Article marqué comme vendu', article });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du marquage comme vendu', error });
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