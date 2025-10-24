const Order = require('../models/Order');
const User = require('../models/User');

// Créer une nouvelle commande
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
      deliveryNote
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
      status: paymentMethod === 'cash' ? 'pending' : 'paid'
    });

    await order.save();

    // Calculer la date de livraison estimée (3-7 jours ouvrables)
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 5); // 5 jours par défaut
    order.estimatedDelivery = estimatedDelivery;
    await order.save();

    res.status(201).json({
      message: 'Commande créée avec succès',
      order: {
        id: order._id,
        status: order.status,
        total: order.total,
        estimatedDelivery: order.estimatedDelivery
      }
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

    const validStatuses = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
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
