const User = require('../models/User');
const bcrypt = require('bcryptjs');
const Article = require('../models/Article');
const DemandeChauffeur = require('../models/DemandeChauffeur');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

// Config Cloudinary (à adapter avec tes clés)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Fonction utilitaire pour calculer le statut dynamique
async function computeUserStatut(user) {
  const now = new Date();
  if (user.role === 'vendeur') {
    // Publication d'au moins un article
    const article = await Article.findOne({ vendeur: user._id });
    return article ? 'actif' : 'inactif';
  }
  if (user.role === 'acheteur') {
    // Achat dans les 6 derniers mois
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    const achat = await Article.findOne({ acheteur: user._id, statutVente: 'vendu', dateCreation: { $gte: sixMonthsAgo } });
    return achat ? 'actif' : 'inactif';
  }
  if (user.role === 'transitaire') {
    // TODO: Propositions de prix sur une pub (quand le modèle sera prêt)
    // Placeholder : toujours inactif pour l'instant
    // Exemple futur :
    // const proposition = await Proposition.findOne({ transitaire: user._id });
    // return proposition ? 'actif' : 'inactif';
    return 'inactif';
  }
  if (user.role === 'chauffeur') {
    // Actif s'il est assigné à au moins une activité (article)
    const article = await Article.findOne({ chauffeur: user._id });
    return article ? 'actif' : 'inactif';
  }
  if (user.role === 'admin') {
    // Connexion dans le dernier mois
    if (!user.dernierAcces) return 'inactif';
    const oneMonthAgo = new Date(now);
    oneMonthAgo.setMonth(now.getMonth() - 1);
    return user.dernierAcces >= oneMonthAgo ? 'actif' : 'inactif';
  }
  return 'inactif';
}

// Récupérer la liste de tous les utilisateurs (option de filtrage par rôle)
exports.getAllUsers = async (req, res) => {
  try {
    const { role, page = 1, limit = 10 } = req.query;
    const filter = role ? { role } : {};
    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .skip((page - 1) * limit)
      .limit(Number(limit));
    // Calculer le statut dynamique pour chaque user
    const usersWithStatut = await Promise.all(users.map(async (u) => {
      const statut = await computeUserStatut(u);
      const userObj = u.toObject();
      userObj.statut = statut;
      return userObj;
    }));
    res.json({
      admins: usersWithStatut,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des utilisateurs', error });
  }
};

// Récupérer le détail d'un utilisateur par son id MongoDB
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    const statut = await computeUserStatut(user);
    const userObj = user.toObject();
    userObj.statut = statut;
    res.json(userObj);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'utilisateur', error });
  }
};

// Mettre à jour un utilisateur (y compris le fcmToken)
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json({ message: 'Utilisateur mis à jour', user });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour', error });
  }
};

// Supprimer un utilisateur (par son id)
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la suppression', error });
  }
};

exports.getProfile = async (req, res) => {
  const user = req.user;
  const statut = await computeUserStatut(user);
  const userObj = user.toObject();
  userObj.statut = statut;
  res.json({ user: userObj });
};

// Créer un utilisateur (chauffeur, admin, etc.)
exports.createUser = async (req, res) => {
  try {
    const { password, ...userData } = req.body;
    // Vérifier unicité email et uid
    const existingEmail = await User.findOne({ email: userData.email });
    if (existingEmail) {
      return res.status(400).json({ message: "Email déjà utilisé" });
    }
    const existingUid = await User.findOne({ uid: userData.uid });
    if (existingUid) {
      return res.status(400).json({ message: "UID déjà utilisé" });
    }
    let hashedPassword = undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }
    const user = new User({
      ...userData,
      password: hashedPassword,
    });
    await user.save();
    res.status(201).json({ message: "Utilisateur créé", user });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la création de l'utilisateur", error });
  }
};

// Changer le mot de passe d'un utilisateur
exports.updatePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: 'Ancien et nouveau mot de passe requis' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });
    if (!user.password) return res.status(400).json({ message: 'Aucun mot de passe défini pour cet utilisateur' });
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Ancien mot de passe incorrect' });
    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du changement de mot de passe', error });
  }
};

// Récupérer la liste des vendeurs avec articlesCount et salesCount
exports.getVendeursStats = async (req, res) => {
  try {
    const vendeurs = await User.find({ role: 'vendeur' });
    const results = await Promise.all(
      vendeurs.map(async (vendeur) => {
        const articlesCount = await Article.countDocuments({ vendeur: vendeur._id });
        const salesCount = await Article.countDocuments({ vendeur: vendeur._id, statutVente: 'vendu' });
        return {
          _id: vendeur._id,
          nom: vendeur.nom,
          prenoms: vendeur.prenoms,
          entreprise: vendeur.entreprise,
          email: vendeur.email,
          statut: await computeUserStatut(vendeur),
          photo: vendeur.photo,
          articlesCount,
          salesCount,
        };
      })
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des stats vendeurs", error });
  }
};

exports.getAcheteursWithAchats = async (req, res) => {
  try {
    const articles = await Article.find({ acheteur: { $ne: null } })
      .populate('acheteur', 'nom prenoms email statut');
    const result = articles.map(article => ({
      acheteurId: article.acheteur._id,
      nom: article.acheteur.nom,
      prenoms: article.acheteur.prenoms,
      email: article.acheteur.email,
      statut: article.acheteur.statut,
      titre: article.titre,
      dateLivraison: article.dateLivraison,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: "Erreur lors de la récupération des achats acheteurs" });
  }
};

exports.uploadProfilePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier envoyé' });
    // Upload sur Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'tranoo/profiles',
      public_id: `${req.user._id}_profile`,
      overwrite: true,
    });
    // Met à jour l'utilisateur
    req.user.photo = result.secure_url;
    await req.user.save();
    res.json({ photo: result.secure_url });
  } catch (err) {
    res.status(500).json({ message: 'Erreur upload photo', error: err.message });
  }
}; 

/**
 * @route POST /users/fcm-token
 * @desc Met à jour le token FCM de l'utilisateur connecté
 * @access Authentifié
 *
 * Exemple de requête (avec axios côté client) :
 *
 *   await axios.post('/users/fcm-token', { fcmToken: 'VOTRE_TOKEN_FCM_ICI' }, {
 *     headers: { Authorization: 'Bearer VOTRE_JWT' }
 *   });
 *
 * Le token FCM doit être récupéré côté mobile/web via le SDK Firebase Messaging.
 */
exports.updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ message: 'Token FCM requis' });
    }
    req.user.fcmToken = fcmToken;
    await req.user.save();
    res.json({
      message: 'Token FCM mis à jour avec succès',
      fcmToken: fcmToken
    });
  } catch (error) {
    res.status(500).json({
      message: 'Erreur lors de la mise à jour du token FCM',
      error: error.message
    });
  }
};

// Récupérer les activités d'un chauffeur (articles livrés ou en cours)
exports.getChauffeurActivities = async (req, res) => {
  try {
    const chauffeurId = req.params.id;
    // On récupère tous les articles où le chauffeur est assigné
    const articles = await Article.find({ chauffeur: chauffeurId })
      .populate('vendeur', 'nom prenoms')
      .populate('acheteur', 'nom prenoms');
    res.json({ activites: articles });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des activités du chauffeur", error });
  }
}; 

// Nouvelle route : liste de tous les acheteurs (même sans achat)
exports.getAllAcheteurs = async (req, res) => {
  try {
    const acheteurs = await User.find({ role: 'acheteur' });
    const acheteursWithStatut = await Promise.all(acheteurs.map(async (u) => {
      const statut = await computeUserStatut(u);
      const userObj = u.toObject();
      userObj.statut = statut;
      return userObj;
    }));
    res.json(acheteursWithStatut);
  } catch (err) {
    res.status(500).json({ message: "Erreur lors de la récupération des acheteurs" });
  }
}; 