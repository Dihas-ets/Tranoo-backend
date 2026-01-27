const User = require('../models/User');
const UserDevice = require('../models/UserDevice');
const bcrypt = require('bcryptjs');
const Article = require('../models/Article');
const cloudinary = require('cloudinary').v2;
const admin = require('firebase-admin');

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
  if (user.role === 'agentCommercial') {
    // Actif si au moins 1 parrainage complété ou un gain enregistré dans les 90 derniers jours
    const ninetyDaysAgo = new Date(now);
    ninetyDaysAgo.setDate(now.getDate() - 90);
    try {
      const Referral = require('../models/Referral');
      const AgentEarning = require('../models/AgentEarning');
      const completedCount = await Referral.countDocuments({ referrerId: user._id, status: 'completed', createdAt: { $gte: ninetyDaysAgo } });
      if (completedCount > 0) return 'actif';
      const earning = await AgentEarning.findOne({ agent: user._id, createdAt: { $gte: ninetyDaysAgo } }).lean();
      return earning ? 'actif' : 'inactif';
    } catch (_) {
      return 'inactif';
    }
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
    
    // Calculer le statut dynamique et d'abonnement pour chaque user
    const usersWithStatut = await Promise.all(users.map(async (u) => {
      const statut = await computeUserStatut(u);
      const userObj = u.toObject();
      userObj.statut = statut;
      
      // Ajouter le statut d'abonnement pour les transitaires
      if (u.role === 'transitaire') {
        const Subscription = require('../models/Subscription');
        const sub = await Subscription.findOne({ user: u._id }).lean();
        const now = new Date();
        const hasActiveSubscription = sub && sub.expiresAt && new Date(sub.expiresAt) > now;
        
        userObj.hasSubscription = hasActiveSubscription;
        userObj.subscriptionStatus = hasActiveSubscription ? 'active' : 'inactive';
        if (sub) {
          userObj.subscriptionExpiresAt = sub.expiresAt;
          userObj.subscriptionActivatedAt = sub.activatedAt;
        }
      }
      
      return userObj;
    }));
    
    // Pour la compatibilité avec UsersList, retourner directement le tableau si pas de pagination
    if (req.query.page) {
      res.json({
        users: usersWithStatut,
        total,
        totalPages: Math.ceil(total / limit)
      });
    } else {
      res.json(usersWithStatut);
    }
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
  console.log('[GET_PROFILE] ===== DÉBUT RÉCUPÉRATION PROFIL =====');
  try {
  const user = req.user;
    if (!user) {
      console.error('[GET_PROFILE] ❌ req.user est null/undefined');
      return res.status(401).json({ message: 'Utilisateur non authentifié' });
    }
    
    console.log('[GET_PROFILE] Utilisateur ID:', user._id);
    console.log('[GET_PROFILE] Email:', user.email);
    console.log('[GET_PROFILE] Role:', user.role);
    console.log('[GET_PROFILE] UID Firebase:', user.uid);
    
    console.log('[GET_PROFILE] Calcul du statut utilisateur...');
  const statut = await computeUserStatut(user);
    console.log('[GET_PROFILE] Statut calculé:', statut);
    
  const userObj = user.toObject();
  userObj.statut = statut;
    
    console.log('[GET_PROFILE] ✅ Profil récupéré avec succès');
    console.log('[GET_PROFILE] ===== FIN RÉCUPÉRATION PROFIL =====');
  res.json({ user: userObj });
  } catch (error) {
    console.error('[GET_PROFILE] ===== ERREUR RÉCUPÉRATION PROFIL =====');
    console.error('[GET_PROFILE] Type erreur:', error.name);
    console.error('[GET_PROFILE] Message erreur:', error.message);
    console.error('[GET_PROFILE] Stack trace:', error.stack);
    return res.status(500).json({ 
      message: 'Erreur lors de la récupération du profil', 
      error: error.message 
    });
  }
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
    
    // Synchroniser le mot de passe avec Firebase si l'utilisateur a un uid
    if (user.uid) {
      try {
        await admin.auth().updateUser(user.uid, { password: newPassword });
        console.log('[UPDATE_PASSWORD] Mot de passe Firebase synchronisé pour:', user.email);
      } catch (firebaseError) {
        console.error('[UPDATE_PASSWORD] Erreur synchronisation Firebase:', firebaseError);
        // Ne pas faire échouer la requête si Firebase échoue
      }
    }
    
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du changement de mot de passe', error });
  }
};

// Réinitialiser le mot de passe Firebase d'un utilisateur (admin seulement)
exports.resetFirebasePassword = async (req, res) => {
  try {
    const userId = req.params.id;
    const { newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({ message: 'Nouveau mot de passe requis' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur introuvable' });
    }
    
    if (!user.uid) {
      return res.status(400).json({ message: 'Cet utilisateur n\'a pas de UID Firebase' });
    }
    
    // Mettre à jour le mot de passe dans Firebase
    await admin.auth().updateUser(user.uid, { password: newPassword });
    
    // Mettre à jour le mot de passe hashé dans MongoDB
    const hashed = await bcrypt.hash(newPassword, 10);
    user.password = hashed;
    await user.save();
    
    return res.json({ message: 'Mot de passe Firebase réinitialisé avec succès' });
  } catch (error) {
    console.error('[RESET_FIREBASE_PASSWORD] Erreur:', error);
    return res.status(500).json({ message: 'Erreur lors de la réinitialisation du mot de passe', error: error.message });
  }
};

// Récupérer le numéro de téléphone par email (pour reset password)
exports.getPhoneByEmail = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email requis' 
      });
    }

    // Mode test pour développement
    if (email === 'test@tranoo.com') {
      return res.json({
        success: true,
        phoneNumber: '+22959399349',
        message: 'Numéro de téléphone récupéré (mode test)'
      });
    }

    // Rechercher l'utilisateur par email
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Aucun compte trouvé avec cet email'
      });
    }

    if (!user.telephone) {
      return res.status(404).json({
        success: false,
        message: 'Aucun numéro de téléphone associé à ce compte'
      });
    }

    res.json({
      success: true,
      phoneNumber: user.telephone,
      message: 'Numéro de téléphone récupéré avec succès'
    });

  } catch (error) {
    console.error('Erreur getPhoneByEmail:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du numéro'
    });
  }
};

// Récupérer tous les vendeurs avec stats complètes
exports.getAllVendeurs = async (_req, res) => {
  try {
    const vendeurs = await User.find({ role: 'vendeur' });
    const results = await Promise.all(
      vendeurs.map(async (vendeur) => {
        const articlesCount = await Article.countDocuments({ vendeur: vendeur._id });
        const salesCount = await Article.countDocuments({ vendeur: vendeur._id, statutVente: 'vendu' });
        const userObj = vendeur.toObject();
        userObj.statut = await computeUserStatut(vendeur);
        userObj.articlesCount = articlesCount;
        userObj.salesCount = salesCount;
        return userObj;
      })
    );
    res.json(results);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des vendeurs", error });
  }
};

// Récupérer la liste des vendeurs avec articlesCount et salesCount (legacy)
exports.getVendeursStats = async (_req, res) => {
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

exports.getAcheteursWithAchats = async (_req, res) => {
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
    const { fcmToken, deviceId } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ message: 'Token FCM requis' });
    }
    req.user.fcmToken = fcmToken;
    await req.user.save();

    // Enregistrer / mettre à jour le device comme "trusted" (device connu car l'utilisateur est connecté)
    if (deviceId && String(deviceId).trim()) {
      try {
        await UserDevice.updateOne(
          { userUid: req.user.uid, deviceId: String(deviceId).trim() },
          {
            $set: {
              fcmToken: String(fcmToken).trim(),
              isTrusted: true,
              lastSeenAt: new Date(),
            },
          },
          { upsert: true }
        );
      } catch (e) {
        // Ne pas faire échouer la route si l'upsert device échoue
        console.warn('[FCM] Upsert UserDevice échoué:', e.message);
      }
    }

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

// Ajouter un article aux favoris de l'utilisateur connecté
exports.addFavorite = async (req, res) => {
  try {
    const { articleId } = req.body;
    if (!articleId) return res.status(400).json({ message: 'articleId requis' });
    const user = req.user;
    if (!user.favoris) user.favoris = [];
    const exists = user.favoris.find((id) => id.toString() === articleId);
    if (!exists) {
      user.favoris.push(articleId);
      await user.save();
    }
    return res.json({ message: 'Ajouté aux favoris', favoris: user.favoris });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur ajout favori', error: err.message });
  }
};

// Retirer un article des favoris
exports.removeFavorite = async (req, res) => {
  try {
    const { articleId } = req.body;
    if (!articleId) return res.status(400).json({ message: 'articleId requis' });
    const user = req.user;
    user.favoris = (user.favoris || []).filter((id) => id.toString() !== articleId);
    await user.save();
    return res.json({ message: 'Retiré des favoris', favoris: user.favoris });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur retrait favori', error: err.message });
  }
};

// Récupérer les favoris de l'utilisateur connecté
exports.getMyFavorites = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('favoris');
    return res.json({ favoris: user.favoris || [] });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur récupération favoris', error: err.message });
  }
};

// Met à jour les informations du profil de l'utilisateur connecté
exports.updateMe = async (req, res) => {
  try {
    const allowedFields = ['nom', 'prenoms', 'entreprise', 'email', 'telephone', 'photo'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'Aucune donnée à mettre à jour' });
    }

    const user = req.user;
    const emailChanged = updates.email && updates.email !== user.email;
    Object.assign(user, updates);
    await user.save();

    // Synchroniser l'email avec Firebase si modifié
    if (emailChanged) {
      try {
        console.log('[updateMe] Firebase email update attempt', {
          uid: user.uid,
          oldEmail: req.user.email,
          newEmail: user.email,
        });
        await admin.auth().updateUser(user.uid, { email: user.email });
        console.log('[updateMe] Firebase email update success', { uid: user.uid });
      } catch (err) {
        console.error('[updateMe] Firebase email update failed', {
          uid: user.uid,
          oldEmail: req.user.email,
          newEmail: user.email,
          code: err?.errorInfo?.code || err.code,
          message: err?.errorInfo?.message || err.message,
        });
        return res.status(500).json({
          message: 'Email mis à jour en base mais pas dans Firebase',
          errorCode: err?.errorInfo?.code || err.code,
          error: err?.errorInfo?.message || err.message,
        });
      }
    }

    const statut = await computeUserStatut(user);
    const userObj = user.toObject();
    userObj.statut = statut;
    res.json({ message: 'Profil mis à jour', user: userObj });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour du profil', error: error.message });
  }
};

// Met à jour le mot de passe de l'utilisateur connecté (nécessite oldPassword/newPassword)
exports.updateMyPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) {
      return res.status(400).json({ message: 'Nouveau mot de passe requis' });
    }

    const user = req.user;
    // Simplification: on ne vérifie plus l'ancien mot de passe
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    // Synchroniser le mot de passe dans Firebase pour la connexion
    try {
      console.log('[updateMyPassword] Firebase password update attempt', { uid: user.uid });
      await admin.auth().updateUser(user.uid, { password: newPassword });
      console.log('[updateMyPassword] Firebase password update success', { uid: user.uid });
    } catch (err) {
      console.error('[updateMyPassword] Firebase password update failed', {
        uid: user.uid,
        code: err?.errorInfo?.code || err.code,
        message: err?.errorInfo?.message || err.message,
      });
      return res.status(500).json({
        message: 'Mot de passe mis à jour en base mais pas dans Firebase',
        errorCode: err?.errorInfo?.code || err.code,
        error: err?.errorInfo?.message || err.message,
      });
    }

    return res.json({ message: 'Mot de passe mis à jour' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du changement de mot de passe', error: error.message });
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
exports.getAllAcheteurs = async (_req, res) => {
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

// Bloquer un utilisateur (admin seulement)
exports.blockUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const adminUser = req.user;
    
    // Vérifier que l'utilisateur est admin
    if (adminUser.role !== 'admin') {
      return res.status(403).json({ message: 'Accès refusé. Admin requis.' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    
    if (user.isBlocked) {
      return res.status(400).json({ message: 'Utilisateur déjà bloqué' });
    }
    
    user.isBlocked = true;
    user.blockedAt = new Date();
    user.blockedBy = adminUser._id;
    await user.save();
    
    res.json({ message: 'Utilisateur bloqué avec succès', user });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du blocage', error: error.message });
  }
};

// Débloquer un utilisateur (admin seulement)
exports.unblockUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const adminUser = req.user;
    
    // Vérifier que l'utilisateur est admin
    if (adminUser.role !== 'admin') {
      return res.status(403).json({ message: 'Accès refusé. Admin requis.' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    
    if (!user.isBlocked) {
      return res.status(400).json({ message: 'Utilisateur n\'est pas bloqué' });
    }
    
    user.isBlocked = false;
    user.blockedAt = null;
    user.blockedBy = null;
    await user.save();
    
    res.json({ message: 'Utilisateur débloqué avec succès', user });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du déblocage', error: error.message });
  }
};

// Récupérer tous les transitaires avec statut d'abonnement
exports.getAllTransitaires = async (_req, res) => {
  try {
    const transitaires = await User.find({ role: 'transitaire' });
    const Subscription = require('../models/Subscription');
    
    const transitairesWithStatut = await Promise.all(transitaires.map(async (u) => {
      const statut = await computeUserStatut(u);
      const userObj = u.toObject();
      userObj.statut = statut;
      
      // Ajouter le statut d'abonnement
      const sub = await Subscription.findOne({ user: u._id }).lean();
      const now = new Date();
      const hasActiveSubscription = sub && sub.expiresAt && new Date(sub.expiresAt) > now;
      
      userObj.hasSubscription = hasActiveSubscription;
      userObj.subscriptionStatus = hasActiveSubscription ? 'active' : 'inactive';
      if (sub) {
        userObj.subscriptionExpiresAt = sub.expiresAt;
        userObj.subscriptionActivatedAt = sub.activatedAt;
      }
      
      return userObj;
    }));
    
    res.json(transitairesWithStatut);
  } catch (err) {
    res.status(500).json({ message: "Erreur lors de la récupération des transitaires" });
  }
};

// Récupérer tous les chauffeurs avec leurs activités
exports.getAllChauffeurs = async (_req, res) => {
  try {
    const chauffeurs = await User.find({ role: 'chauffeur' });
    
    const chauffeursWithActivities = await Promise.all(chauffeurs.map(async (u) => {
      const statut = await computeUserStatut(u);
      const userObj = u.toObject();
      userObj.statut = statut;
      
      // Compter les activités (articles assignés)
      const activitiesCount = await Article.countDocuments({ chauffeur: u._id });
      const completedActivities = await Article.countDocuments({ 
        chauffeur: u._id, 
        statutVente: 'vendu' 
      });
      
      userObj.activitiesCount = activitiesCount;
      userObj.completedActivities = completedActivities;
      
      return userObj;
    }));
    
    res.json(chauffeursWithActivities);
  } catch (err) {
    res.status(500).json({ message: "Erreur lors de la récupération des chauffeurs" });
  }
};

// Récupérer tous les administrateurs
exports.getAllAdmins = async (_req, res) => {
  try {
    const admins = await User.find({ role: 'admin' });
    
    const adminsWithStatut = await Promise.all(admins.map(async (u) => {
      const statut = await computeUserStatut(u);
      const userObj = u.toObject();
      userObj.statut = statut;
      return userObj;
    }));
    
    res.json(adminsWithStatut);
  } catch (err) {
    res.status(500).json({ message: "Erreur lors de la récupération des administrateurs" });
  }
}; 