const Delivery = require('../models/Delivery');
const Order = require('../models/Order');
const User = require('../models/User');
const LivreurBalance = require('../models/LivreurBalance');
const DeliverySettings = require('../models/DeliverySettings');
const Payment = require('../models/Payment');
const Article = require('../models/Article');
const notificationController = require('./notificationController');

// Haversine distance (km)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

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

const ensureDistanceKm = (delivery) => {
  if (delivery.distanceKm && delivery.distanceKm > 0) return delivery.distanceKm;
  const d = delivery.lieuDepart || {};
  const a = delivery.lieuDestination || {};
  if (
    typeof d.latitude === 'number' &&
    typeof d.longitude === 'number' &&
    typeof a.latitude === 'number' &&
    typeof a.longitude === 'number'
  ) {
    const km = haversineKm(d.latitude, d.longitude, a.latitude, a.longitude);
    delivery.distanceKm = Math.round(km * 100) / 100;
    return delivery.distanceKm;
  }
  return 0;
};

const creditSellerAndCompany = async (delivery, settings) => {
  // Reconstituer le CA vendeur depuis les pièces.
  const pieces = Array.isArray(delivery.pieces) ? delivery.pieces : [];
  let grossArticlesAmount = 0;
  const articleIds = pieces
    .map((p) => p?.articleId)
    .filter(Boolean);
  const articles = await Article.find({ _id: { $in: articleIds } })
    .select('_id vendeur')
    .lean();
  const vendorByArticle = new Map(articles.map((a) => [String(a._id), a.vendeur ? String(a.vendeur) : null]));
  const sellerGrossByVendor = new Map();
  for (const p of pieces) {
    const unitOrLine = Number(p?.prix || 0);
    // Compatibilité: prix peut déjà être une ligne totale.
    const lineAmount = unitOrLine > 0 ? unitOrLine : 0;
    grossArticlesAmount += lineAmount;
    const vendorId = vendorByArticle.get(String(p?.articleId || ''));
    if (!vendorId) continue;
    sellerGrossByVendor.set(vendorId, (sellerGrossByVendor.get(vendorId) || 0) + lineAmount);
  }

  const commissionPct = Number(settings.sellerCommissionPercent || 10) / 100;
  for (const [vendorId, gross] of sellerGrossByVendor.entries()) {
    const netSeller = Math.max(0, Math.round(gross * (1 - commissionPct)));
    if (netSeller <= 0) continue;
    await Payment.create({
      user: String(vendorId),
      amount: netSeller,
      currency: 'XOF',
      status: 'success',
      type: 'vente',
      description: `Crédit vendeur - livraison ${delivery._id}`,
      method: 'system',
      transactionId: `DELIVERY_SELLER_${delivery._id}_${vendorId}`,
    });
  }

  const distanceKm = ensureDistanceKm(delivery);
  const companyArticlesShare = Math.max(0, Math.round(grossArticlesAmount * commissionPct));
  const companyKmShare = Math.max(0, Math.round(distanceKm * Number(settings.entreprisePerKm || 25)));
  const companyTotal = companyArticlesShare + companyKmShare;
  if (companyTotal > 0) {
    await Payment.create({
      user: 'enterprise',
      amount: companyTotal,
      currency: 'XOF',
      status: 'success',
      type: 'vente',
      description: `Part entreprise - livraison ${delivery._id}`,
      method: 'system',
      transactionId: `DELIVERY_ENTERPRISE_${delivery._id}`,
    });
  }
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

    // Récupérer les settings de livraison (tarif/km, rayon, etc.)
    const settings = await DeliverySettings.getSettings();
    
    // Calculer le prix estimé si distanceKm est fourni
    let prixEstime = null;
    if (distanceKm != null && distanceKm > 0) {
      prixEstime = Math.round(distanceKm * settings.pricePerKm);
    }

    const delivery = await Delivery.create({
      orderId,
      acheteur: order.userId,
      statut: 'commandé',
      distanceKm,
      lieuDepart,
      lieuDestination,
      pieces,
      fournisseur,
      fraisLivraison: fraisLivraison ?? prixEstime ?? order.deliveryFee ?? 0,
      fraisColis: fraisColis ?? order.subtotal ?? 0,
      totalCommande: totalCommande ?? order.total ?? 0,
      prixEstime,
      notificationRound: 1,
      lastNotificationAt: new Date(),
    });

    await updateOrderStatus(orderId, 'commandé');

    // Notifications :
    // - Acheteur: nouvelle livraison créée
    // - Admins: nouvelle commande avec livraison
    // - Livreurs PROCHES uniquement (géolocalisation)
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

      // Livreurs PROCHES uniquement (géolocalisation)
      await notifyNearbyLivreurs(delivery, settings);
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

// Détails d'une livraison par commande
exports.getDeliveryByOrderId = async (req, res) => {
  try {
    const delivery = await Delivery.findOne({ orderId: req.params.orderId })
      .populate('acheteur', 'nom prenoms telephone')
      .populate('livreur', 'nom prenoms telephone')
      .sort({ createdAt: -1 });
    if (!delivery) {
      return res.status(404).json({ message: 'Livraison introuvable pour cette commande' });
    }
    res.json({ delivery });
  } catch (error) {
    console.error('Erreur getDeliveryByOrderId:', error);
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

    // Multi-pickups: si pickups[] existe, on valide un pickup en particulier.
    const pickupIndexRaw = req.query?.pickupIndex ?? req.body?.pickupIndex;
    const pickupIndex =
      pickupIndexRaw != null ? Number(pickupIndexRaw) : null;

    if (Array.isArray(delivery.pickups) && delivery.pickups.length > 0 && pickupIndex != null) {
      if (!Number.isInteger(pickupIndex) || pickupIndex < 0 || pickupIndex >= delivery.pickups.length) {
        return res.status(400).json({ message: 'pickupIndex invalide' });
      }
      const p = delivery.pickups[pickupIndex];
      p.statut = 'picked_up';
      p.dateRecuperation = new Date();

      const allPicked = delivery.pickups.every((x) => x.statut === 'picked_up');
      if (allPicked) {
        delivery.statut = 'en_cours';
        delivery.colisRecupere = true;
        delivery.dateRecuperation = new Date();
      } else {
        // reste assigné/en_cours selon existant
        if (delivery.statut === 'commandé') delivery.statut = 'assigné';
      }
    } else {
      // Ancienne logique (un seul fournisseur)
      delivery.statut = 'en_cours';
      delivery.colisRecupere = true;
      delivery.dateRecuperation = new Date();
    }
    await delivery.save();

    // Statut commande: passer en_cours uniquement quand TOUS les pickups sont récupérés
    if (delivery.colisRecupere) {
      await updateOrderStatus(delivery.orderId, 'en_cours');
    } else {
      await updateOrderStatus(delivery.orderId, delivery.statut === 'assigné' ? 'assigné' : 'commandé');
    }

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

// Notifier arrivée du livreur chez l'acheteur (avant paiement / retour)
exports.notifyArrival = async (req, res) => {
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
    if (!delivery.colisRecupere) {
      return res.status(400).json({
        message: 'Le colis doit être récupéré chez le fournisseur avant de notifier l’arrivée.',
      });
    }

    // Marquer l'arrivée sans changer forcément le statut (garde en_cours si déjà)
    delivery.dateArrivee = new Date();
    if (delivery.statut === 'assigné') {
      delivery.statut = 'en_cours';
    }
    await delivery.save();

    // Mettre à jour la commande (statut en_cours si nécessaire)
    await updateOrderStatus(delivery.orderId, delivery.statut === 'en_cours' ? 'en_cours' : 'assigné');

    // Notifier l'acheteur (push + DB)
    try {
      await notificationController.createDeliveryNotification(
        delivery.acheteur,
        user._id,
        delivery._id,
        'arrived',
        {
          deliveryId: delivery._id.toString(),
          orderId: delivery.orderId?.toString() || '',
          totalCommande: String(delivery.totalCommande ?? 0),
          fraisLivraison: String(delivery.fraisLivraison ?? 0),
          fraisColis: String(delivery.fraisColis ?? 0),
        }
      );
    } catch (e) {
      console.error('Erreur notif notifyArrival:', e.message);
    }

    res.json({ success: true, message: 'Arrivée notifiée', delivery });
  } catch (error) {
    console.error('Erreur notifyArrival:', error);
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
    if (!delivery.colisRecupere) {
      return res.status(400).json({
        message: 'Le colis doit être récupéré chez le fournisseur avant la livraison.',
      });
    }
    if (!delivery.dateArrivee) {
      return res.status(400).json({
        message: 'Le livreur doit d’abord notifier son arrivée chez l’acheteur (Sur place).',
      });
    }

    if (delivery.statut === 'livré' && delivery.colisLivre) {
      return res.json({ success: true, message: 'Livraison déjà validée', delivery });
    }
    ensureDistanceKm(delivery);
    delivery.statut = 'livré';
    delivery.colisLivre = true;
    delivery.dateLivraison = new Date();
    const settings = await DeliverySettings.getSettings();
    // Nouveau gain livreur configurable: FCFA/Km
    const gainLivreur = Math.max(
      0,
      Math.round((delivery.distanceKm || 0) * Number(settings.livreurPerKm || 50))
    );
    delivery.gainLivreur = gainLivreur;
    await delivery.save();

    await updateOrderStatus(delivery.orderId, 'livré');
    await incrementLivreurBalance(delivery.livreur, delivery.gainLivreur, delivery._id, 'livré');
    await creditSellerAndCompany(delivery, settings);

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
      const amount = String(delivery.gainLivreur ?? '');
      await notificationController.createNotification(
        delivery.livreur,
        'system',
        '',
        '',
        'paiement',
        delivery._id,
        'Delivery',
        { amount },
        {
          titleKey: 'payment.balanceUpdated.title',
          messageKey: 'payment.balanceDelivered.message',
          params: { amount },
        }
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

// Demande de retour par l'acheteur (avec motif obligatoire)
exports.requestReturnByAcheteur = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: 'Non authentifié' });

    const { reason } = req.body || {};
    if (!reason || String(reason).trim().length < 3) {
      return res.status(400).json({ message: 'Motif de retour requis' });
    }

    const delivery = await Delivery.findById(req.params.id);
    if (!delivery) return res.status(404).json({ message: 'Livraison introuvable' });

    // Autoriser uniquement l'acheteur de cette livraison
    if (String(delivery.acheteur) !== String(user._id)) {
      return res.status(403).json({ message: 'Accès refusé' });
    }

    delivery.statut = 'retour';
    delivery.dateRetour = new Date();
    delivery.raisonRetour = String(reason).trim();
    await delivery.save();

    await updateOrderStatus(delivery.orderId, 'retour');

    // Notifier admins + livreur
    try {
      const admins = await User.find({
        role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'] },
      }).select('_id');
      for (const adm of admins) {
        await notificationController.createDeliveryNotification(
          adm._id,
          user._id,
          delivery._id,
          'return',
          { reason: delivery.raisonRetour }
        );
      }
      if (delivery.livreur) {
        await notificationController.createDeliveryNotification(
          delivery.livreur,
          user._id,
          delivery._id,
          'return',
          { reason: delivery.raisonRetour }
        );
      }
    } catch (e) {
      console.error('Erreur notif requestReturnByAcheteur:', e.message);
    }

    res.json({ success: true, message: 'Retour signalé', delivery });
  } catch (error) {
    console.error('Erreur requestReturnByAcheteur:', error);
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
        '',
        '',
        'delivery',
        delivery._id,
        'Delivery',
        {},
        {
          titleKey: 'delivery.refusedReminder.title',
          messageKey: 'delivery.refusedReminder.message',
          params: {},
        }
      );

      // Livreur - balance
      const amount = String(delivery.gainLivreur ?? '');
      await notificationController.createNotification(
        delivery.livreur,
        'system',
        '',
        '',
        'paiement',
        delivery._id,
        'Delivery',
        { amount },
        {
          titleKey: 'payment.balanceUpdated.title',
          messageKey: 'payment.balanceRefused.message',
          params: { amount },
        }
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

    if (delivery.statut === 'livré' && delivery.colisLivre) {
      return res.json({ success: true, message: 'Livraison déjà confirmée', delivery });
    }
    ensureDistanceKm(delivery);
    delivery.statut = 'livré';
    delivery.colisLivre = true;
    delivery.dateLivraison = new Date();
    const settings = await DeliverySettings.getSettings();
    delivery.gainLivreur = Math.max(
      0,
      Math.round((delivery.distanceKm || 0) * Number(settings.livreurPerKm || 50))
    );
    await delivery.save();

    await updateOrderStatus(delivery.orderId, 'livré');
    await incrementLivreurBalance(delivery.livreur, delivery.gainLivreur, delivery._id, 'livré');
    await creditSellerAndCompany(delivery, settings);

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

      const amount = String(delivery.gainLivreur ?? '');
      await notificationController.createNotification(
        delivery.livreur,
        'system',
        '',
        '',
        'paiement',
        delivery._id,
        'Delivery',
        { amount },
        {
          titleKey: 'payment.balanceUpdated.title',
          messageKey: 'payment.balanceConfirmed.message',
          params: { amount },
        }
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

// Helper: Notifier les livreurs proches d'une livraison
async function notifyNearbyLivreurs(delivery, settings) {
  const departLat = delivery.lieuDepart?.latitude;
  const departLng = delivery.lieuDepart?.longitude;
  
  if (!departLat || !departLng) {
    console.warn('[DELIVERY] Pas de coordonnées départ pour notifier livreurs proches');
    return;
  }

  const searchRadiusMeters = Math.round(settings.searchRadiusKm * 1000);
  
  // Trouver les livreurs en ligne avec localisation dans le rayon
  const livreurs = await User.find({
    role: 'livreur',
    isOnline: true,
    'location.coordinates': { $exists: true, $type: 'array' },
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [departLng, departLat] },
        $maxDistance: searchRadiusMeters,
      },
    },
  }).select('_id location');

  if (livreurs.length === 0) {
    console.log('[DELIVERY] Aucun livreur proche trouvé pour la livraison', delivery._id);
    return;
  }

  // Notifier chaque livreur proche et enregistrer dans livreursNotifies
  const notifiedIds = [];
  for (const liv of livreurs) {
    try {
      await notificationController.createDeliveryNotification(
        liv._id,
        'system',
        delivery._id,
        'created'
      );
      notifiedIds.push({
        livreur: liv._id,
        notifiedAt: new Date(),
        round: delivery.notificationRound || 1,
      });
    } catch (e) {
      console.error(`[DELIVERY] Erreur notif livreur ${liv._id}:`, e.message);
    }
  }

  // Mettre à jour la livraison avec les livreurs notifiés
  delivery.livreursNotifies = notifiedIds;
  delivery.lastNotificationAt = new Date();
  await delivery.save();
  
  console.log(`[DELIVERY] ${notifiedIds.length} livreur(s) proche(s) notifié(s) pour livraison ${delivery._id}`);
}

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

// Récupérer les settings de livraison
exports.getDeliverySettings = async (req, res) => {
  try {
    const settings = await DeliverySettings.getSettings();
    console.log('[DELIVERY_SETTINGS] pricePerKm=%s', settings?.pricePerKm);
    res.json({ settings });
  } catch (error) {
    console.error('Erreur getDeliverySettings:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Modifier le tarif par km (admin uniquement)
exports.updatePricePerKm = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: 'Non authentifié' });
    
    const isAdmin = ['admin', 'superAdmin', 'principal'].includes(user.role);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }

    const { pricePerKm } = req.body;
    if (pricePerKm == null || pricePerKm < 0) {
      return res.status(400).json({ message: 'pricePerKm invalide (doit être >= 0)' });
    }

    const settings = await DeliverySettings.getSettings();
    settings.pricePerKm = pricePerKm;
    settings.updatedBy = user._id;
    settings.updatedAt = new Date();
    await settings.save();

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Erreur updatePricePerKm:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Modifier la configuration de répartition (admin uniquement)
exports.updateRevenueConfig = async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!user) return res.status(401).json({ message: 'Non authentifié' });
    const isAdmin = ['admin', 'superAdmin', 'principal'].includes(user.role);
    if (!isAdmin) {
      return res.status(403).json({ message: 'Accès réservé aux administrateurs' });
    }
    const {
      sellerCommissionPercent,
      livreurPerKm,
      entreprisePerKm,
    } = req.body || {};
    const settings = await DeliverySettings.getSettings();
    if (sellerCommissionPercent != null) {
      const v = Number(sellerCommissionPercent);
      if (Number.isNaN(v) || v < 0 || v > 100) {
        return res.status(400).json({ message: 'sellerCommissionPercent invalide (0..100)' });
      }
      settings.sellerCommissionPercent = v;
    }
    if (livreurPerKm != null) {
      const v = Number(livreurPerKm);
      if (Number.isNaN(v) || v < 0) {
        return res.status(400).json({ message: 'livreurPerKm invalide (>=0)' });
      }
      settings.livreurPerKm = v;
    }
    if (entreprisePerKm != null) {
      const v = Number(entreprisePerKm);
      if (Number.isNaN(v) || v < 0) {
        return res.status(400).json({ message: 'entreprisePerKm invalide (>=0)' });
      }
      settings.entreprisePerKm = v;
    }
    settings.updatedBy = user._id;
    settings.updatedAt = new Date();
    await settings.save();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Erreur updateRevenueConfig:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Calcul des frais de livraison basé sur la distance
exports.calculateDeliveryFee = async (req, res) => {
  try {
    const { supplier_lat, supplier_lng, delivery_lat, delivery_lng } = req.body;
    console.log(
      '[DELIVERY_CALC] input supplier=(%s,%s) delivery=(%s,%s)',
      supplier_lat,
      supplier_lng,
      delivery_lat,
      delivery_lng
    );
    
    if (!supplier_lat || !supplier_lng || !delivery_lat || !delivery_lng) {
      return res.status(400).json({ 
        message: 'Coordonnées fournisseur et livraison requises' 
      });
    }
    
    // Calculer la distance en km
    const distanceKm = haversineKm(
      parseFloat(supplier_lat), 
      parseFloat(supplier_lng), 
      parseFloat(delivery_lat), 
      parseFloat(delivery_lng)
    );
    
    // Récupérer les settings de livraison
    const settings = await DeliverySettings.getSettings();
    
    // Calculer les frais de livraison
    const billedKm = distanceKm > 0 && distanceKm < 1 ? 1 : distanceKm;
    const deliveryFee = Math.round(billedKm * settings.pricePerKm);
    console.log(
      '[DELIVERY_CALC] pricePerKm=%s distanceKm=%s billedKm=%s fee=%s',
      settings.pricePerKm,
      distanceKm,
      billedKm,
      deliveryFee
    );
    
    res.json({ 
      success: true,
      distanceKm: Math.round(distanceKm * 100) / 100, // 2 décimales
      deliveryFee,
      pricePerKm: settings.pricePerKm
    });
  } catch (error) {
    console.error('Erreur calculateDeliveryFee:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Worker de réoffre des livraisons (toutes les 60s)
let deliveryOfferWorkerInterval = null;

exports.startDeliveryOfferWorker = () => {
  if (deliveryOfferWorkerInterval) {
    console.log('[DELIVERY WORKER] Déjà démarré');
    return;
  }

  console.log('⏱️  Worker de réoffre livraisons démarré (60s)');
  
  deliveryOfferWorkerInterval = setInterval(async () => {
    try {
      const settings = await DeliverySettings.getSettings();
      const now = new Date();
      const sixtySecondsAgo = new Date(now.getTime() - settings.notificationDisplayDuration * 1000);

      // Trouver les livraisons non acceptées depuis plus de 60s
      const pendingDeliveries = await Delivery.find({
        statut: 'commandé',
        livreur: null,
        lastNotificationAt: { $lt: sixtySecondsAgo },
      }).limit(50); // Limiter pour éviter la surcharge

      for (const delivery of pendingDeliveries) {
        const departLat = delivery.lieuDepart?.latitude;
        const departLng = delivery.lieuDepart?.longitude;
        
        if (!departLat || !departLng) {
          console.warn(`[DELIVERY WORKER] Livraison ${delivery._id} sans coordonnées départ`);
          continue;
        }

        // Récupérer les IDs des livreurs déjà notifiés dans ce tour
        const alreadyNotifiedIds = delivery.livreursNotifies
          .filter(n => n.round === delivery.notificationRound)
          .map(n => n.livreur.toString());

        // Trouver de nouveaux livreurs proches non encore notifiés dans ce tour
        const searchRadiusMeters = Math.round(settings.searchRadiusKm * 1000);
        const newLivreurs = await User.find({
          role: 'livreur',
          isOnline: true,
          _id: { $nin: alreadyNotifiedIds },
          'location.coordinates': { $exists: true, $type: 'array' },
          location: {
            $near: {
              $geometry: { type: 'Point', coordinates: [departLng, departLat] },
              $maxDistance: searchRadiusMeters,
            },
          },
        }).select('_id location').limit(10); // Limiter à 10 par tour

        if (newLivreurs.length === 0) {
          // Aucun nouveau livreur proche: incrémenter le tour et réoffrir aux mêmes
          delivery.notificationRound = (delivery.notificationRound || 1) + 1;
          delivery.livreursNotifies = []; // Réinitialiser pour réoffrir aux mêmes
          await delivery.save();
          await notifyNearbyLivreurs(delivery, settings);
        } else {
          // Notifier les nouveaux livreurs
          await notifyNearbyLivreurs(delivery, settings);
        }
      }

      if (pendingDeliveries.length > 0) {
        console.log(`[DELIVERY WORKER] ${pendingDeliveries.length} livraison(s) réofferte(s)`);
      }
    } catch (error) {
      console.error('[DELIVERY WORKER] Erreur:', error.message);
    }
  }, 60000); // Toutes les 60 secondes
};
