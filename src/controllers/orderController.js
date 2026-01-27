const Order = require('../models/Order');
const Delivery = require('../models/Delivery');
const User = require('../models/User');
const Article = require('../models/Article');
const notificationController = require('./notificationController');

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
    } = req.body;

    const userId = req.user.id;

    // Validation des données
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Aucun article dans la commande' });
    }

    if (!deliveryAddress) {
      return res.status(400).json({ message: 'Adresse de livraison requise' });
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
      status: paymentMethod === 'cash' ? 'pending' : 'paid',
      isDeliveryRequired: !!isDeliveryRequired,
      conditionsRemboursement: {
        affichee: !!conditionsAffichee,
        dateAffichage: conditionsAffichee ? new Date() : null,
      },
    });

    await order.save();

    // Calculer la date de livraison estimée (3-7 jours ouvrables)
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 5); // 5 jours par défaut
    order.estimatedDelivery = estimatedDelivery;
    await order.save();

    let deliveryCreated = null;

    // Si livraison requise, créer une Delivery liée
    if (order.isDeliveryRequired) {
      const mappedPieces = (items || []).map((it) => ({
        articleId: it.articleId,
        titre: it.title,
        quantite: it.quantity,
        prix: it.totalPrice,
      }));

      const info = deliveryInfo || {};
      let fournisseur = info.fournisseur;
      if (!fournisseur?.userId && items?.length > 0 && items[0].articleId) {
        const firstArt = await Article.findById(items[0].articleId).select('vendeur').lean();
        if (firstArt?.vendeur) {
          const v = await User.findById(firstArt.vendeur).select('nom prenoms entreprise adresse telephone').lean();
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
      }

      deliveryCreated = await Delivery.create({
        orderId: order._id,
        acheteur: order.userId,
        statut: 'commandé',
        distanceKm: info.distanceKm,
        lieuDepart: info.lieuDepart || {
          nom: fournisseur?.nom || 'Fournisseur',
          adresse: fournisseur?.adresse,
          latitude: info?.lieuDepart?.latitude,
          longitude: info?.lieuDepart?.longitude,
          telephone: fournisseur?.telephone,
        },
        lieuDestination: info.lieuDestination || {
          nom: 'Acheteur',
          adresse: deliveryAddress,
        },
        pieces: mappedPieces,
        fournisseur: fournisseur || info.fournisseur,
        fraisLivraison: deliveryFee ?? 0,
        fraisColis: subtotal ?? 0,
        totalCommande: total ?? 0,
      });

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
