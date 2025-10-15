const User = require('../models/User');
const Article = require('../models/Article');

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
      voitures: voituresCount,
      pieces: piecesCount,
      clients: clientsCount,
      chauffeurs: chauffeursCount,
      transitaires: transitairesCount,
      utilisateurs: usersCount,
      admins: adminsCount,
      vendeurs: vendeursCount,
      vendeursActifs,
      vendeursInactifs,
      adminsActifs,
      adminsInactifs,
      annee: anneeActivite
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
      acheteurs,
      acheteursActifs,
      acheteursInactifs,
      achatsEnCours,
      achatsLIVRES
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur stats acheteurs" });
  }
}; 