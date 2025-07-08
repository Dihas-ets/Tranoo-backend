const User = require('../models/User');
const Article = require('../models/Article');

exports.getStats = async (_req, res) => {
  try {
    // Nombre total de voitures
    const voituresCount = await Article.countDocuments({ type: 'voiture' });
    // Nombre total de pièces
    const piecesCount = await Article.countDocuments({ type: 'piece' });
    // Nombre total de clients (rôle acheteur)
    const clientsCount = await User.countDocuments({ role: 'acheteur' });
    // Nombre total de chauffeurs
    const chauffeursCount = await User.countDocuments({ role: 'chauffeur' });
    // Nombre total d'utilisateurs
    const usersCount = await User.countDocuments();
    // Nombre total d'admins
    const adminsCount = await User.countDocuments({ role: 'admin' });
    // Nombre total de vendeurs
    const vendeursCount = await User.countDocuments({ role: 'vendeur' });
    // Nombre total de transitaires
    const transitairesCount = await User.countDocuments({ role: 'transitaire' });

    res.json({
      voitures: voituresCount,
      pieces: piecesCount,
      clients: clientsCount,
      chauffeurs: chauffeursCount,
      utilisateurs: usersCount,
      admins: adminsCount,
      vendeurs: vendeursCount,
      transitaires: transitairesCount
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