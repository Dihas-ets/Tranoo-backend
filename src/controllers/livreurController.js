const User = require('../models/User');
const Delivery = require('../models/Delivery');
const LivreurBalance = require('../models/LivreurBalance');
const admin = require('firebase-admin');

// Helpers
const getLivreurFromReq = async (req) => {
  const uid = req.user?.uid || req.user?.id;
  if (!uid) return null;
  const user = await User.findOne({ uid });
  return user && user.role === 'livreur' ? user : null;
};

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
    const user = await getLivreurFromReq(req);
    if (!user) {
      return res.status(404).json({ message: 'Livreur non trouvé ou rôle invalide' });
    }

    const { latitude, longitude, address, deliveryId } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: 'latitude et longitude requis' });
    }

    // Mettre à jour le lastSeen
    user.lastSeen = new Date();
    await user.save();

    // Si deliveryId fourni, pousser la localisation dans la livraison active
    if (deliveryId) {
      const delivery = await Delivery.findById(deliveryId);
      if (delivery && String(delivery.livreur) === String(user._id)) {
        const location = {
          latitude,
          longitude,
          timestamp: new Date(),
          address,
        };
        delivery.currentLocation = location;
        delivery.locationHistory.push(location);
        await delivery.save();
      }
    }

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
    const user = await getLivreurFromReq(req);
    if (!user) {
      return res.status(404).json({ message: 'Livreur non trouvé ou rôle invalide' });
    }

    const deliveries = await Delivery.find({
      statut: 'commandé',
      livreur: null,
    }).sort({ dateCommande: -1 });

    res.json({
      deliveries,
      message: deliveries.length ? 'Livraisons disponibles' : 'Aucune livraison en attente',
    });
  } catch (error) {
    console.error('Erreur récupération livraisons en attente:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Récupérer les livraisons actives
exports.getActiveDeliveries = async (req, res) => {
  try {
    const user = await getLivreurFromReq(req);
    if (!user) {
      return res.status(404).json({ message: 'Livreur non trouvé ou rôle invalide' });
    }

    const deliveries = await Delivery.find({
      livreur: user._id,
      statut: { $in: ['assigné', 'en_cours'] },
    }).sort({ updatedAt: -1 });

    res.json({
      deliveries,
      message: deliveries.length ? 'Livraisons actives' : 'Aucune livraison active',
    });
  } catch (error) {
    console.error('Erreur récupération livraisons actives:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Accepter une livraison
exports.acceptDelivery = async (req, res) => {
  try {
    const user = await getLivreurFromReq(req);
    if (!user) {
      return res.status(404).json({ message: 'Livreur non trouvé ou rôle invalide' });
    }

    const { id } = req.params;
    const delivery = await Delivery.findOne({
      _id: id,
      statut: 'commandé',
      livreur: null,
    });
    if (!delivery) {
      return res.status(404).json({ message: 'Livraison non disponible' });
    }

    delivery.livreur = user._id;
    delivery.statut = 'assigné';
    delivery.dateAcceptation = new Date();
    await delivery.save();

    res.json({
      success: true,
      message: 'Livraison acceptée avec succès',
      delivery,
    });
  } catch (error) {
    console.error('Erreur acceptation livraison:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Compléter une livraison
exports.completeDelivery = async (req, res) => {
  try {
    const user = await getLivreurFromReq(req);
    if (!user) {
      return res.status(404).json({ message: 'Livreur non trouvé ou rôle invalide' });
    }
    const { id } = req.params;

    const delivery = await Delivery.findById(id);
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });
    if (String(delivery.livreur) !== String(user._id)) {
      return res.status(403).json({ message: 'Vous n’êtes pas assigné à cette livraison' });
    }

    delivery.statut = 'livré';
    delivery.colisLivre = true;
    delivery.dateLivraison = new Date();
    if (!delivery.gainLivreur || delivery.gainLivreur <= 0) {
      delivery.gainLivreur = delivery.fraisLivraison || 0;
    }
    await delivery.save();

    // Crédite la balance du livreur
    const balance = await LivreurBalance.findOneAndUpdate(
      { livreur: user._id },
      { $setOnInsert: { livreur: user._id } },
      { upsert: true, new: true }
    );
    balance.balance = (balance.balance || 0) + delivery.gainLivreur;
    balance.totalGains = (balance.totalGains || 0) + delivery.gainLivreur;
    balance.nombreLivraisons = (balance.nombreLivraisons || 0) + 1;
    balance.nombreLivraisonsReussies = (balance.nombreLivraisonsReussies || 0) + 1;
    balance.transactions.push({
      type: 'gain',
      montant: delivery.gainLivreur,
      deliveryId: delivery._id,
      description: `Livraison ${delivery._id} (livré)`,
      statut: 'valide',
    });
    await balance.save();

    res.json({
      success: true,
      message: 'Livraison complétée avec succès',
      delivery,
    });
  } catch (error) {
    console.error('Erreur complétion livraison:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Récupérer l'historique des livraisons
exports.getDeliveryHistory = async (req, res) => {
  try {
    const user = await getLivreurFromReq(req);
    if (!user) {
      return res.status(404).json({ message: 'Livreur non trouvé ou rôle invalide' });
    }

    const deliveries = await Delivery.find({
      livreur: user._id,
      statut: { $in: ['livré', 'refusé', 'annulé'] },
    }).sort({ updatedAt: -1 });

    res.json({
      deliveries,
      message: deliveries.length ? 'Historique des livraisons' : 'Aucun historique disponible',
    });
  } catch (error) {
    console.error('Erreur récupération historique:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

