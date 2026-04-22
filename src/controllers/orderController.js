const Order = require('../models/Order');
const Delivery = require('../models/Delivery');
const User = require('../models/User');
const Article = require('../models/Article');
const Invoice = require('../models/Invoice');
const notificationController = require('./notificationController');
const DeliverySettings = require('../models/DeliverySettings');
const { nextInvoiceNumber } = require('../utils/invoiceNumberService');

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
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

// Créer une nouvelle commande (pièces détachées ou autre)
const createOrder = async (req, res) => {
  try {
    const {
      items,
      subtotal,
      deliveryFee,
      discount,
      total,
      paymentMethod,
      deliveryAddress,
      deliveryNote,
      // Champs optionnels pour livraison
      isDeliveryRequired,
      deliveryInfo, // { distanceKm, lieuDepart, lieuDestination, fournisseur }
      conditionsAffichee, // bool: conditions de remboursement affichées
      paymentConfirmed,
    } = req.body;

    const userId = req.user.id;
    console.log('[ORDER] createOrder userId=', userId?.toString?.() || userId);

    // Validation des données
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Aucun article dans la commande' });
    }

    if (!deliveryAddress) {
      return res.status(400).json({ message: 'Adresse de livraison requise' });
    }

    if (paymentConfirmed !== true) {
      console.warn('[ORDER] paiement non confirme, commande refusee');
      return res.status(400).json({
        message: 'Paiement requis avant creation de commande',
      });
    }

    // Créer la commande
    const order = new Order({
      userId,
      items,
      subtotal,
      deliveryFee,
      discount,
      total,
      paymentMethod,
      deliveryAddress,
      deliveryNote,
      status: 'pending', // Toujours 'pending' car le paiement en ligne se fait après réception du colis
      isDeliveryRequired: !!isDeliveryRequired,
      conditionsRemboursement: {
        affichee: !!conditionsAffichee,
        dateAffichage: conditionsAffichee ? new Date() : null,
      },
    });

    await order.save();
    console.log('[ORDER] commande enregistree id=', order._id?.toString());

    // Calculer la date de livraison estimée (3-7 jours ouvrables)
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 5); // 5 jours par défaut
    order.estimatedDelivery = estimatedDelivery;
    await order.save();

    let deliveryCreated = null;

    // Si livraison requise, créer une Delivery liée
    if (order.isDeliveryRequired) {
      const info = deliveryInfo || {};
      const destination = info.lieuDestination || {
        nom: 'Acheteur',
        adresse: deliveryAddress,
        latitude: info?.lieuDestination?.latitude,
        longitude: info?.lieuDestination?.longitude,
      };

      // Multi-fournisseurs: regrouper items par vendeur
      const articleIds = (items || [])
        .map((it) => it.articleId)
        .filter(Boolean);
      const articles = await Article.find({ _id: { $in: articleIds } })
        .select('vendeur titre fournisseur')
        .lean();
      const articleById = new Map(articles.map((a) => [String(a._id), a]));

      const groups = new Map(); // vendeurId -> { items: [], articles: [] }
      for (const it of items || []) {
        const art = articleById.get(String(it.articleId));
        const vendeurId = art?.vendeur ? String(art.vendeur) : 'unknown';
        if (!groups.has(vendeurId)) groups.set(vendeurId, []);
        groups.get(vendeurId).push({ it, art });
      }

      const settings = await DeliverySettings.getSettings();
      const pickups = [];
      let totalFee = 0;
      let totalDistance = 0;

      for (const [vendeurId, rows] of groups.entries()) {
        // Fournisseur / vendeur info
        let fournisseur = info.fournisseur;
        if (vendeurId !== 'unknown') {
          const v = await User.findById(vendeurId)
            .select('nom prenoms entreprise adresse telephone')
            .lean();
          if (v) {
            fournisseur = {
              userId: v._id,
              nom: [v.nom, v.prenoms].filter(Boolean).join(' '),
              entreprise: v.entreprise,
              adresse: v.adresse,
              telephone: v.telephone,
            };
          }
        }

        // lieuDepart: prioriser article.fournisseur coords, sinon fournisseur.adresse
        const firstArt = rows.find((r) => r.art)?.art;
        const f = firstArt?.fournisseur || {};
        const lieuDepart = {
          nom: fournisseur?.nom || f?.nom || 'Fournisseur',
          adresse: f?.adresseTexte || fournisseur?.adresse || '—',
          latitude: f?.latitude,
          longitude: f?.longitude,
          telephone: f?.telephone || fournisseur?.telephone,
        };

        const pieces = rows.map(({ it }) => ({
          articleId: it.articleId,
          titre: it.title,
          quantite: it.quantity,
          prix: it.totalPrice,
        }));

        let distanceKm = null;
        let fee = 0;
        if (
          typeof lieuDepart.latitude === 'number' &&
          typeof lieuDepart.longitude === 'number' &&
          typeof destination.latitude === 'number' &&
          typeof destination.longitude === 'number'
        ) {
          distanceKm = haversineKm(
            lieuDepart.latitude,
            lieuDepart.longitude,
            destination.latitude,
            destination.longitude
          );
          fee = Math.round(distanceKm * (settings.pricePerKm || 75));
        }

        totalFee += fee;
        totalDistance += distanceKm || 0;
        pickups.push({
          fournisseur,
          lieuDepart,
          pieces,
          distanceKm: distanceKm != null ? Math.round(distanceKm * 100) / 100 : null,
          fraisLivraison: fee,
          statut: 'pending',
        });
      }

      // Champs hérités (compatibilité): utiliser le premier pickup
      const firstPickup = pickups[0];
      deliveryCreated = await Delivery.create({
        orderId: order._id,
        acheteur: order.userId,
        statut: 'commandé',
        distanceKm: totalDistance > 0 ? Math.round(totalDistance * 100) / 100 : info.distanceKm,
        lieuDepart: firstPickup?.lieuDepart || info.lieuDepart,
        lieuDestination: destination,
        pieces: pickups.flatMap((p) => p.pieces || []),
        fournisseur: firstPickup?.fournisseur || info.fournisseur,
        pickups,
        fraisLivraison: totalFee || deliveryFee || 0,
        fraisColis: subtotal ?? 0,
        totalCommande: total ?? 0,
      });

      // Refléter le total dans la commande pour affichage stable
      order.deliveryFee = deliveryCreated.fraisLivraison;
      order.total = (order.subtotal || subtotal || 0) + (order.deliveryFee || 0);

      order.deliveryId = deliveryCreated._id;
      order.status = 'commandé';
      await order.save();

      // Notifications : admin + livreur (à la commande)
      try {
        const admins = await User.find({
          role: { $in: ['admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'] },
        }).select('_id');
        for (const a of admins) {
          await notificationController.createDeliveryNotification(
            a._id,
            'system',
            deliveryCreated._id,
            'created'
          );
        }
        const livreurs = await User.find({ role: 'livreur', isOnline: true }).select('_id');
        for (const liv of livreurs) {
          await notificationController.createDeliveryNotification(
            liv._id,
            'system',
            deliveryCreated._id,
            'created'
          );
        }
      } catch (e) {
        console.error('Erreur notif createOrder+delivery:', e.message);
      }
    }

    // Générer une facture dès création de commande (paiement déjà effectué côté app)
    try {
      const firstItem = Array.isArray(items) && items.length > 0 ? items[0] : null;
      let sellerName = null;
      let shopName = null;
      if (firstItem?.articleId) {
        const article = await Article.findById(firstItem.articleId)
          .select('vendeur entreprise')
          .lean();
        if (article?.vendeur) {
          const seller = await User.findById(article.vendeur)
            .select('nom prenoms entreprise')
            .lean();
          if (seller) {
            sellerName = [seller.nom, seller.prenoms].filter(Boolean).join(' ').trim() || null;
            shopName = seller.entreprise || article.entreprise || null;
          }
        }
      }

      const invoiceNumber = await nextInvoiceNumber();
      const reference = `INV-${String(order._id).slice(-8).toUpperCase()}`;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const invoiceItems = (items || []).map((it) => ({
        articleId: String(it.articleId || ''),
        title: String(it.title || 'Article'),
        quantity: Number(it.quantity || 1),
        unitPrice: Number(it.unitPrice || 0),
        totalPrice: Number(it.totalPrice || 0),
        imageUrl: it.imageUrl || '',
      }));

      await Invoice.create({
        orderId: order._id,
        userId: userId,
        invoiceNumber,
        items: invoiceItems,
        subtotal: Number(subtotal || 0),
        deliveryFee: Number(order.deliveryFee || deliveryFee || 0),
        discount: Number(discount || 0),
        tax: 0,
        total: Number(order.total || total || 0),
        paymentMethod: paymentMethod || 'online',
        paymentStatus: 'paid',
        paymentDate: new Date(),
        deliveryAddress: deliveryAddress || '—',
        deliveryStatus: 'processing',
        company: shopName || 'Tranoo',
        sellerName,
        shopName: shopName || 'Tranoo',
        reference,
        status: 'paid',
        issueDate: new Date(),
        dueDate,
      });
      console.log('[ORDER] facture generee pour commande=', order._id?.toString());
    } catch (invoiceError) {
      console.error('Erreur génération facture:', invoiceError);
      // Ne pas bloquer la création de commande si la facture échoue
    }

    res.status(201).json({
      message: 'Commande créée avec succès',
      order: {
        id: order._id,
        status: order.status,
        total: order.total,
        estimatedDelivery: order.estimatedDelivery,
        deliveryId: order.deliveryId || null,
      },
      delivery: deliveryCreated,
    });

  } catch (error) {
    console.error('Erreur création commande:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la création de la commande' });
  }
};

// Récupérer les commandes d'un utilisateur
const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status } = req.query;

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'nom email telephone');

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Erreur récupération commandes:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des commandes' });
  }
};

// Récupérer une commande spécifique
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({ _id: id, userId })
      .populate('userId', 'nom email telephone');

    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    res.json(order);

  } catch (error) {
    console.error('Erreur récupération commande:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération de la commande' });
  }
};

// Mettre à jour le statut d'une commande (admin)
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, trackingNumber } = req.body;

    const validStatuses = [
      'pending',
      'paid',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      // statuts liés aux livraisons
      'commandé',
      'assigné',
      'en_cours',
      'livré',
      'refusé',
      'retour',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Commande non trouvée' });
    }

    order.status = status;
    order.updatedAt = new Date();

    if (trackingNumber) {
      order.trackingNumber = trackingNumber;
    }

    if (status === 'delivered') {
      order.actualDelivery = new Date();
    }

    await order.save();

    res.json({
      message: 'Statut de commande mis à jour',
      order: {
        id: order._id,
        status: order.status,
        trackingNumber: order.trackingNumber
      }
    });

  } catch (error) {
    console.error('Erreur mise à jour statut:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour' });
  }
};

// Récupérer toutes les commandes (admin)
const getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, userId } = req.query;

    const query = {};
    if (status) query.status = status;
    if (userId) query.userId = userId;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('userId', 'nom email telephone');

    const total = await Order.countDocuments(query);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Erreur récupération toutes commandes:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des commandes' });
  }
};

module.exports = {
  createOrder,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  getAllOrders
};
