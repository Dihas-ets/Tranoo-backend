const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const User = require('../models/User');
const LivreurBalance = require('../models/LivreurBalance');
const notificationController = require('./notificationController');

// Helpers
const getUserFromReq = async (req) => {
  const uid = req.user?.uid || req.user?.id;
  if (!uid) return null;
  return User.findOne({ uid });
};

const ensureDelivery = async (id) => {
  const delivery = await Delivery.findById(id)
    .populate('acheteur', 'nom prenoms telephone')
    .populate('livreur', 'nom prenoms telephone')
    .populate('orderId');
  return delivery;
};

const ensureLivreur = (user) => {
  return user && user.role === 'livreur';
};

const updateOrderStatus = async (orderId, statut) => {
  if (!orderId) return;
  await Order.findByIdAndUpdate(orderId, { status: statut }, { new: true });
};

const incrementLivreurBalance = async (livreurId, gain, deliveryId, statut) => {
  if (!livreurId || !gain || gain <= 0) return;
  const balance = await LivreurBalance.findOneAndUpdate(
    { livreur: livreurId },
    { $setOnInsert: { livreur: livreurId } },
    { upsert: true, new: true }
  );

  balance.balance = (balance.balance || 0) + gain;
  balance.totalGains = (balance.totalGains || 0) + gain;
  balance.nombreLivraisons = (balance.nombreLivraisons || 0) + 1;
  balance.nombreLivraisonsReussies = (balance.nombreLivraisonsReussies || 0) + 1;
  balance.transactions.push({
    type: 'gain',
    montant: gain,
    deliveryId,
    description: `Livraison ${deliveryId} (${statut})`,
    statut: 'valide',
  });
  await balance.save();
};

// Créer une livraison depuis une commande
exports.createDelivery = async (req, res) => {
  try {
    const {
      orderId,
      distanceKm,
      lieuDepart,
      lieuDestination,
      pieces,
      fournisseur,
      fraisLivraison,
      fraisColis,
      totalCommande,
    } = req.body;

    if (!orderId) {
      return res.status(400).json({ message: 'orderId requis' });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Commande introuvable' });

    const delivery = await Delivery.create({
      orderId,
      acheteur: order.userId,
      statut: 'commandé',
      distanceKm,
      lieuDepart,
      lieuDestination,
      pieces,
      fournisseur,
      fraisLivraison: fraisLivraison ?? order.deliveryFee ?? 0,
      fraisColis: fraisColis ?? order.subtotal ?? 0,
      totalCommande: totalCommande ?? order.total ?? 0,
    });

    await updateOrderStatus(orderId, 'commandé');

    // Notifications :
    // - Acheteur: nouvelle livraison créée
    // - Admins: nouvelle commande avec livraison
    // - Livreurs: nouvelle livraison disponible
    try {
      // Acheteur
      await notificationController.createDeliveryNotification(
        order.userId,
        'system',
        delivery._id,
        'created'
      );

      // Admins (tous les rôles admin pertinents)
      const admins = await User.find({
        role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'] },
      }).select('_id');
      for (const adm of admins) {
        await notificationController.createDeliveryNotification(
          adm._id,
          'system',
          delivery._id,
          'created'
        );
      }

      // Livreurs (par défaut tous les livreurs actifs/en ligne)
      const livreurs = await User.find({
        role: 'livreur',
        isOnline: true,
      }).select('_id');
      for (const liv of livreurs) {
        await notificationController.createDeliveryNotification(
          liv._id,
          'system',
          delivery._id,
          'created'
        );
      }
    } catch (e) {
      console.error('Erreur notif createDelivery:', e.message);
    }

    res.status(201).json({ success: true, delivery });
  } catch (error) {
    console.error('Erreur createDelivery:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Livraisons en attente (non assignées)
exports.getPendingDeliveries = async (req, res) => {
  try {
    const deliveries = await Delivery.find({ statut: 'commandé', livreur: null })
      .sort({ dateCommande: -1 });
    res.json({ deliveries });
  } catch (error) {
    console.error('Erreur pending deliveries:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Livraisons actives du livreur
exports.getActiveDeliveries = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!ensureLivreur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }
    const deliveries = await Delivery.find({
      livreur: user._id,
      statut: { $in: ['assigné', 'en_cours'] },
    }).sort({ updatedAt: -1 });
    res.json({ deliveries });
  } catch (error) {
    console.error('Erreur active deliveries:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Détails d'une livraison
exports.getDeliveryDetails = async (req, res) => {
  try {
    const delivery = await ensureDelivery(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });
    res.json({ delivery });
  } catch (error) {
    console.error('Erreur getDeliveryDetails:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Accepter une livraison
exports.acceptDelivery = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!ensureLivreur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }

    const delivery = await Delivery.findOne({
      _id: req.params.id,
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

    await updateOrderStatus(delivery.orderId, 'assigné');

    // Notifier les admins qu'une livraison a été acceptée
    try {
      const admins = await User.find({
        role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'] },
      }).select('_id');
      for (const adm of admins) {
        await notificationController.createDeliveryNotification(
          adm._id,
          user._id,
          delivery._id,
          'assigned'
        );
      }
    } catch (e) {
      console.error('Erreur notif acceptDelivery:', e.message);
    }

    res.json({ success: true, message: 'Livraison acceptée', delivery });
  } catch (error) {
    console.error('Erreur acceptDelivery:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Refuser une livraison (la remet disponible)
exports.rejectDelivery = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!ensureLivreur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });
    if (String(delivery.livreur) !== String(user._id)) {
      return res.status(403).json({ message: 'Vous n’êtes pas assigné à cette livraison' });
    }

    delivery.livreur = null;
    delivery.statut = 'commandé';
    await delivery.save();

    await updateOrderStatus(delivery.orderId, 'pending');

    res.json({ success: true, message: 'Livraison refusée, remise en attente', delivery });
  } catch (error) {
    console.error('Erreur rejectDelivery:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Notifier récupération du colis
exports.notifyPickup = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!ensureLivreur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });
    if (String(delivery.livreur) !== String(user._id)) {
      return res.status(403).json({ message: 'Vous n’êtes pas assigné à cette livraison' });
    }

    delivery.statut = 'en_cours';
    delivery.colisRecupere = true;
    delivery.dateRecuperation = new Date();
    await delivery.save();

    await updateOrderStatus(delivery.orderId, 'en_cours');

    // Notifier les admins que le colis a été récupéré
    try {
      const admins = await User.find({
        role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'] },
      }).select('_id');
      for (const adm of admins) {
        await notificationController.createDeliveryNotification(
          adm._id,
          user._id,
          delivery._id,
          'picked_up'
        );
      }
    } catch (e) {
      console.error('Erreur notif notifyPickup:', e.message);
    }

    res.json({ success: true, message: 'Colis récupéré', delivery });
  } catch (error) {
    console.error('Erreur notifyPickup:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Notifier livraison (côté livreur)
exports.notifyDelivery = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!ensureLivreur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });
    if (String(delivery.livreur) !== String(user._id)) {
      return res.status(403).json({ message: 'Vous n’êtes pas assigné à cette livraison' });
    }

    delivery.statut = 'livré';
    delivery.colisLivre = true;
    delivery.dateLivraison = new Date();
    // Si gain non défini, utiliser fraisLivraison
    if (!delivery.gainLivreur || delivery.gainLivreur <= 0) {
      delivery.gainLivreur = delivery.fraisLivraison || 0;
    }
    await delivery.save();

    await updateOrderStatus(delivery.orderId, 'livré');
    await incrementLivreurBalance(delivery.livreur, delivery.gainLivreur, delivery._id, 'livré');

    // Notifications :
    // - Admins: colis livré
    // - Acheteur: colis livré
    // - Livreur: balance incrémentée
    try {
      // Admins
      const admins = await User.find({
        role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'] },
      }).select('_id');
      for (const adm of admins) {
        await notificationController.createDeliveryNotification(
          adm._id,
          user._id,
          delivery._id,
          'delivered'
        );
      }

      // Acheteur
      await notificationController.createDeliveryNotification(
        delivery.acheteur,
        user._id,
        delivery._id,
        'delivered'
      );

      // Livreur: notification de balance (type paiement)
      await notificationController.createNotification(
        delivery.livreur,
        'system',
        'Balance mise à jour',
        `Votre balance a été créditée de ${delivery.gainLivreur} XOF pour une livraison livrée.`,
        'paiement',
        delivery._id,
        'Delivery'
      );
    } catch (e) {
      console.error('Erreur notif notifyDelivery:', e.message);
    }

    res.json({ success: true, message: 'Livraison notifiée', delivery });
  } catch (error) {
    console.error('Erreur notifyDelivery:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Notifier refus client
exports.notifyRefusal = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!ensureLivreur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });
    if (String(delivery.livreur) !== String(user._id)) {
      return res.status(403).json({ message: 'Vous n’êtes pas assigné à cette livraison' });
    }

    delivery.statut = 'refusé';
    delivery.colisRefuse = true;
    delivery.dateRefus = new Date();
    delivery.raisonRefus = req.body?.raisonRefus;
    delivery.remboursement = {
      montant: delivery.fraisColis || 0,
      statut: 'en_attente',
      dateRemboursement: null,
    };
    // Le livreur conserve les frais de livraison
    if (!delivery.gainLivreur || delivery.gainLivreur <= 0) {
      delivery.gainLivreur = delivery.fraisLivraison || 0;
    }
    await delivery.save();

    await updateOrderStatus(delivery.orderId, 'refusé');
    await incrementLivreurBalance(delivery.livreur, delivery.gainLivreur, delivery._id, 'refusé');

    // Notifications :
    // - Admins: colis refusé
    // - Acheteur: rappel règles de remboursement
    // - Livreur: balance incrémentée (frais livraison)
    try {
      // Admins
      const admins = await User.find({
        role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'] },
      }).select('_id');
      for (const adm of admins) {
        await notificationController.createDeliveryNotification(
          adm._id,
          user._id,
          delivery._id,
          'refused'
        );
      }

      // Acheteur - message explicite sur les règles
      await notificationController.createNotification(
        delivery.acheteur,
        'system',
        'Colis refusé - Rappel des conditions',
        "Le colis a été refusé. Conformément aux conditions, les frais de livraison restent dus, seuls les frais du colis peuvent être remboursés.",
        'delivery',
        delivery._id,
        'Delivery'
      );

      // Livreur - balance
      await notificationController.createNotification(
        delivery.livreur,
        'system',
        'Balance mise à jour',
        `Votre balance a été créditée de ${delivery.gainLivreur} XOF pour une livraison refusée (frais de livraison).`,
        'paiement',
        delivery._id,
        'Delivery'
      );
    } catch (e) {
      console.error('Erreur notif notifyRefusal:', e.message);
    }

    res.json({ success: true, message: 'Refus notifié', delivery });
  } catch (error) {
    console.error('Erreur notifyRefusal:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Retour de pièce par l'acheteur (bouton chauffeur) → notifier admin + vendeur
exports.notifyReturn = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!ensureLivreur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }

    const delivery = await Delivery.findById(req.params.id)
      .populate('orderId')
      .lean();
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });
    if (String(delivery.livreur) !== String(user._id)) {
      return res.status(403).json({ message: 'Vous n\'êtes pas assigné à cette livraison' });
    }
    if (delivery.statut !== 'livré') {
      return res.status(400).json({
        message: 'Le retour ne peut être signalé que pour une livraison déjà effectuée (statut livré).',
      });
    }

    await Delivery.findByIdAndUpdate(req.params.id, {
      statut: 'retour',
      dateRetour: new Date(),
      raisonRetour: req.body?.raisonRetour || undefined,
    });
    await updateOrderStatus(delivery.orderId?._id || delivery.orderId, 'retour');

    const admins = await User.find({
      role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'] },
    }).select('_id');
    for (const a of admins) {
      await notificationController.createDeliveryNotification(
        a._id,
        user._id,
        delivery._id,
        'return'
      );
    }

    const vendeurId = delivery.fournisseur?.userId;
    if (vendeurId) {
      await notificationController.createDeliveryNotification(
        vendeurId,
        user._id,
        delivery._id,
        'return'
      );
    }

    const updated = await ensureDelivery(req.params.id);
    res.json({ success: true, message: 'Retour signalé. Admin et vendeur ont été notifiés.', delivery: updated });
  } catch (error) {
    console.error('Erreur notifyReturn:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Confirmation par l'acheteur
exports.confirmDelivery = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });

    if (String(delivery.acheteur) !== String(user._id)) {
      return res.status(403).json({ message: 'Accès réservé à l’acheteur' });
    }

    delivery.statut = 'livré';
    delivery.colisLivre = true;
    delivery.dateLivraison = new Date();
    if (!delivery.gainLivreur || delivery.gainLivreur <= 0) {
      delivery.gainLivreur = delivery.fraisLivraison || 0;
    }
    await delivery.save();

    await updateOrderStatus(delivery.orderId, 'livré');
    await incrementLivreurBalance(delivery.livreur, delivery.gainLivreur, delivery._id, 'livré');

    // Notifications :
    // - Admins: acheteur a confirmé la livraison
    // - Livreur: balance incrémentée (si pas déjà notifié)
    try {
      const admins = await User.find({
        role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'] },
      }).select('_id');
      for (const adm of admins) {
        await notificationController.createDeliveryNotification(
          adm._id,
          user._id,
          delivery._id,
          'delivered'
        );
      }

      await notificationController.createNotification(
        delivery.livreur,
        'system',
        'Balance mise à jour',
        `Votre balance a été créditée de ${delivery.gainLivreur} XOF après confirmation de livraison par l’acheteur.`,
        'paiement',
        delivery._id,
        'Delivery'
      );
    } catch (e) {
      console.error('Erreur notif confirmDelivery:', e.message);
    }

    res.json({ success: true, message: 'Livraison confirmée', delivery });
  } catch (error) {
    console.error('Erreur confirmDelivery:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Mise à jour position GPS du livreur
exports.updateLocation = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!ensureLivreur(user)) {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }
    const { latitude, longitude, address } = req.body;
    if (latitude == null || longitude == null) {
      return res.status(400).json({ message: 'latitude et longitude requis' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });
    if (String(delivery.livreur) !== String(user._id)) {
      return res.status(403).json({ message: 'Vous n’êtes pas assigné à cette livraison' });
    }

    const location = {
      latitude,
      longitude,
      timestamp: new Date(),
      address,
    };
    delivery.currentLocation = location;
    delivery.locationHistory.push(location);
    await delivery.save();

    res.json({ success: true, message: 'Localisation mise à jour', delivery });
  } catch (error) {
    console.error('Erreur updateLocation:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Historique des livraisons (livreur ou acheteur)
exports.getDeliveryHistory = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: 'Non authentifié' });

    const filter = {};
    if (ensureLivreur(user)) {
      filter.livreur = user._id;
    } else {
      filter.acheteur = user._id;
    }
    filter.statut = { $in: ['livré', 'refusé', 'retour', 'annulé'] };

    const deliveries = await Delivery.find(filter).sort({ updatedAt: -1 });
    res.json({ deliveries });
  } catch (error) {
    console.error('Erreur getDeliveryHistory:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};
