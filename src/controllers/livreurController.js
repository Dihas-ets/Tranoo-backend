const User = require('../models/User');
const admin = require('firebase-admin');

// Toggle statut en ligne/hors ligne
exports.toggleStatus = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { isOnline } = req.body;

    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (user.role !== 'livreur') {
      return res.status(403).json({ message: 'Accès refusé: rôle non autorisé' });
    }

    user.isOnline = isOnline;
    user.lastSeen = new Date();
    await user.save();

    res.json({
      success: true,
      isOnline: user.isOnline,
      message: isOnline ? 'Vous êtes maintenant en ligne' : 'Vous êtes maintenant hors ligne',
    });
  } catch (error) {
    console.error('Erreur toggle status livreur:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Récupérer le statut actuel
exports.getStatus = async (req, res) => {
  try {
    const userId = req.user.uid;
    const user = await User.findOne({ uid: userId });

    if (!user || user.role !== 'livreur') {
      return res.status(404).json({ message: 'Livreur non trouvé' });
    }

    res.json({
      isOnline: user.isOnline || false,
      lastSeen: user.lastSeen,
    });
  } catch (error) {
    console.error('Erreur récupération statut livreur:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Mettre à jour la localisation GPS
exports.updateLocation = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { latitude, longitude, timestamp } = req.body;

    const user = await User.findOne({ uid: userId });
    if (!user || user.role !== 'livreur') {
      return res.status(404).json({ message: 'Livreur non trouvé' });
    }

    // Mettre à jour la localisation dans le modèle User
    // Note: Vous devrez peut-être ajouter un champ 'location' au modèle User
    // ou créer un modèle séparé pour les positions GPS
    user.lastSeen = new Date();
    await user.save();

    // Ici, vous pouvez aussi stocker la position dans une collection séparée
    // pour l'historique des positions

    res.json({
      success: true,
      message: 'Localisation mise à jour',
    });
  } catch (error) {
    console.error('Erreur mise à jour localisation:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Récupérer les livraisons en attente
exports.getPendingDeliveries = async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // TODO: Implémenter la logique pour récupérer les livraisons en attente
    // Cela dépendra de votre modèle de données pour les livraisons
    // Pour l'instant, on retourne une liste vide
    
    res.json({
      deliveries: [],
      message: 'Aucune livraison en attente',
    });
  } catch (error) {
    console.error('Erreur récupération livraisons en attente:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Récupérer les livraisons actives
exports.getActiveDeliveries = async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // TODO: Implémenter la logique pour récupérer les livraisons actives
    // Cela dépendra de votre modèle de données pour les livraisons
    // Pour l'instant, on retourne une liste vide
    
    res.json({
      deliveries: [],
      message: 'Aucune livraison active',
    });
  } catch (error) {
    console.error('Erreur récupération livraisons actives:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Accepter une livraison
exports.acceptDelivery = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    // TODO: Implémenter la logique pour accepter une livraison
    // Cela dépendra de votre modèle de données pour les livraisons
    
    res.json({
      success: true,
      message: 'Livraison acceptée avec succès',
      deliveryId: id,
    });
  } catch (error) {
    console.error('Erreur acceptation livraison:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Compléter une livraison
exports.completeDelivery = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { id } = req.params;

    // TODO: Implémenter la logique pour compléter une livraison
    // Cela dépendra de votre modèle de données pour les livraisons
    
    res.json({
      success: true,
      message: 'Livraison complétée avec succès',
      deliveryId: id,
    });
  } catch (error) {
    console.error('Erreur complétion livraison:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Récupérer l'historique des livraisons
exports.getDeliveryHistory = async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // TODO: Implémenter la logique pour récupérer l'historique
    // Cela dépendra de votre modèle de données pour les livraisons
    
    res.json({
      deliveries: [],
      message: 'Aucun historique disponible',
    });
  } catch (error) {
    console.error('Erreur récupération historique:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

