const Order = require('../models/Order');
const User = require('../models/User');
const Article = require('../models/Article');
const Invoice = require('../models/Invoice');
const { nextInvoiceNumber } = require('../utils/invoiceNumberService');

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
      // Champ conservé pour compatibilité clients (ne crée plus de doc Delivery)
      isDeliveryRequired,
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
        isDeliveryRequired: order.isDeliveryRequired,
      },
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
