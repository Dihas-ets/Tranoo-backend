const User = require('../models/User');
const Article = require('../models/Article');
const Payment = require('../models/Payment');

exports.getStats = async (_req, res) => {
  try {
    // Fonction utilitaire pour calculer le statut dynamique
    async function computeUserStatut(user) {
      const now = new Date();
      if (user.role === 'vendeur') {
        const article = await Article.findOne({ vendeur: user._id });
        return article ? 'actif' : 'inactif';
      }
      if (user.role === 'acheteur') {
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        const achat = await Article.findOne({ acheteur: user._id, statutVente: 'vendu', dateCreation: { $gte: sixMonthsAgo } });
        return achat ? 'actif' : 'inactif';
      }
      if (user.role === 'transitaire') {
        return 'inactif'; // TODO: implémenter la logique des propositions
      }
      if (user.role === 'chauffeur') {
        const article = await Article.findOne({ chauffeur: user._id });
        return article ? 'actif' : 'inactif';
      }
      if (user.role === 'admin') {
        if (!user.dernierAcces) return 'inactif';
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(now.getMonth() - 1);
        return user.dernierAcces >= oneMonthAgo ? 'actif' : 'inactif';
      }
      return 'inactif';
    }

    // Comptes de base
    const acheteursCount = await User.countDocuments({ role: 'acheteur' });
    const chauffeursCount = await User.countDocuments({ role: 'chauffeur' });
    const transitairesCount = await User.countDocuments({ role: 'transitaire' });
    const clientsCount = acheteursCount + chauffeursCount + transitairesCount;
    const voituresCount = await Article.countDocuments({ type: 'voiture' });
    const piecesCount = await Article.countDocuments({ type: 'piece' });
    const usersCount = await User.countDocuments();
    const adminsCount = await User.countDocuments({ role: 'admin' });
    const vendeursCount = await User.countDocuments({ role: 'vendeur' });

    // Stats dynamiques pour vendeurs
    const vendeurs = await User.find({ role: 'vendeur' });
    let vendeursActifs = 0;
    let vendeursInactifs = 0;
    for (const vendeur of vendeurs) {
      const statut = await computeUserStatut(vendeur);
      if (statut === 'actif') vendeursActifs++;
      else vendeursInactifs++;
    }

    // Stats dynamiques pour admins
    const admins = await User.find({ role: 'admin' });
    let adminsActifs = 0;
    let adminsInactifs = 0;
    for (const admin of admins) {
      const statut = await computeUserStatut(admin);
      if (statut === 'actif') adminsActifs++;
      else adminsInactifs++;
    }

    // Année d'activité (depuis 2020)
    const launchYear = 2020;
    const currentYear = new Date().getFullYear();
    const anneeActivite = currentYear - launchYear + 1;

    res.json({
      voitures: Number(voituresCount),
      pieces: Number(piecesCount),
      clients: Number(clientsCount),
      chauffeurs: Number(chauffeursCount),
      transitaires: Number(transitairesCount),
      utilisateurs: Number(usersCount),
      admins: Number(adminsCount),
      vendeurs: Number(vendeursCount),
      vendeursActifs: Number(vendeursActifs),
      vendeursInactifs: Number(vendeursInactifs),
      adminsActifs: Number(adminsActifs),
      adminsInactifs: Number(adminsInactifs),
      annee: Number(anneeActivite)
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des statistiques', error });
  }
};

exports.getAcheteursStats = async (_req, res) => {
  try {
    const acheteurs = await User.countDocuments({ role: "acheteur" });
    const acheteursActifs = await User.countDocuments({ role: "acheteur", statut: "actif" });
    const acheteursInactifs = await User.countDocuments({ role: "acheteur", statut: "inactif" });
    // Achats en cours = articles avec un acheteur, non vendus, ou dateLivraison null
    const achatsEnCours = await Article.countDocuments({ acheteur: { $ne: null }, statutVente: { $ne: "vendu" } });
    // Achats livrés = articles avec un acheteur, statutVente vendu, et dateLivraison non null
    const achatsLIVRES = await Article.countDocuments({ acheteur: { $ne: null }, statutVente: "vendu", dateLivraison: { $ne: null } });
    res.json({
      acheteurs: Number(acheteurs),
      acheteursActifs: Number(acheteursActifs),
      acheteursInactifs: Number(acheteursInactifs),
      achatsEnCours: Number(achatsEnCours),
      achatsLIVRES: Number(achatsLIVRES)
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur stats acheteurs" });
  }
};

/** Résumé vendeur pour l’onglet Statistiques (Tranoo Pro / marque). */
exports.getSellerMarqueStats = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== 'vendeur') {
      return res.status(403).json({ message: 'Réservé aux vendeurs' });
    }
    const uid = user._id;
    const userKeys = [uid, String(uid)];

    const venteAgg = await Payment.aggregate([
      {
        $match: {
          user: { $in: userKeys },
          type: 'vente',
          status: 'success',
        },
      },
      {
        $group: {
          _id: null,
          totalRevenueFcfa: { $sum: '$amount' },
          venteCount: { $sum: 1 },
        },
      },
    ]);
    const totalRevenueFcfa = Math.round(venteAgg[0]?.totalRevenueFcfa || 0);
    const venteSuccessCount = venteAgg[0]?.venteCount || 0;

    const baseListed = {
      vendeur: uid,
      statut: 'en_ligne',
      statutVente: { $ne: 'vendu' },
    };
    const vehiclesOnline = await Article.countDocuments({ ...baseListed, type: 'voiture' });
    const piecesOnline = await Article.countDocuments({ ...baseListed, type: 'piece' });
    const vehiclesSold = await Article.countDocuments({
      vendeur: uid,
      type: 'voiture',
      statutVente: 'vendu',
    });
    const piecesSold = await Article.countDocuments({
      vendeur: uid,
      type: 'piece',
      statutVente: 'vendu',
    });

    const u = await User.findById(uid).select('vendeurType').lean();
    const vendeurType = (u?.vendeurType || 'mixte').toString();

    return res.json({
      vendeurType,
      totalRevenueFcfa,
      venteSuccessCount,
      vehiclesOnline,
      piecesOnline,
      vehiclesSold,
      piecesSold,
    });
  } catch (error) {
    console.error('[getSellerMarqueStats]', error);
    return res.status(500).json({ message: 'Erreur stats vendeur', error: error.message });
  }
};
