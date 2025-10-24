const DeliverySettings = require('../models/DeliverySettings');

// Récupérer les paramètres de livraison
const getDeliverySettings = async (req, res) => {
  try {
    let settings = await DeliverySettings.findOne();
    
    // Si aucun paramètre n'existe, créer les paramètres par défaut
    if (!settings) {
      settings = new DeliverySettings();
      await settings.save();
    }

    res.json(settings);
  } catch (error) {
    console.error('Erreur récupération paramètres:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la récupération des paramètres' });
  }
};

// Mettre à jour les paramètres de livraison
const updateDeliverySettings = async (req, res) => {
  try {
    const {
      deliveryFee,
      discount,
      freeDeliveryThreshold,
      enableDiscounts,
      enableFreeDelivery,
      estimatedDeliveryDays
    } = req.body;

    // Validation des données
    if (deliveryFee < 0) {
      return res.status(400).json({ message: 'Les frais de livraison ne peuvent pas être négatifs' });
    }

    if (discount < 0) {
      return res.status(400).json({ message: 'La remise ne peut pas être négative' });
    }

    if (freeDeliveryThreshold < 0) {
      return res.status(400).json({ message: 'Le seuil de livraison gratuite ne peut pas être négatif' });
    }

    if (estimatedDeliveryDays < 1 || estimatedDeliveryDays > 30) {
      return res.status(400).json({ message: 'Le délai de livraison doit être entre 1 et 30 jours' });
    }

    // Mettre à jour ou créer les paramètres
    let settings = await DeliverySettings.findOne();
    
    if (!settings) {
      settings = new DeliverySettings();
    }

    settings.deliveryFee = deliveryFee;
    settings.discount = discount;
    settings.freeDeliveryThreshold = freeDeliveryThreshold;
    settings.enableDiscounts = enableDiscounts;
    settings.enableFreeDelivery = enableFreeDelivery;
    settings.estimatedDeliveryDays = estimatedDeliveryDays;
    settings.updatedBy = req.user.id;
    settings.updatedAt = new Date();

    await settings.save();

    res.json({
      message: 'Paramètres de livraison mis à jour avec succès',
      settings
    });

  } catch (error) {
    console.error('Erreur mise à jour paramètres:', error);
    res.status(500).json({ message: 'Erreur serveur lors de la mise à jour des paramètres' });
  }
};

// Calculer les frais de livraison pour une commande
const calculateDeliveryFees = async (subtotal) => {
  try {
    const settings = await DeliverySettings.findOne();
    
    if (!settings) {
      return {
        deliveryFee: 720,
        discount: 0,
        total: subtotal + 720
      };
    }

    let deliveryFee = settings.deliveryFee;
    let discount = 0;

    // Appliquer la livraison gratuite si activée et seuil atteint
    if (settings.enableFreeDelivery && subtotal >= settings.freeDeliveryThreshold) {
      deliveryFee = 0;
    }

    // Appliquer la remise si activée
    if (settings.enableDiscounts && deliveryFee > 0) {
      discount = Math.min(settings.discount, deliveryFee);
      deliveryFee = Math.max(0, deliveryFee - discount);
    }

    return {
      deliveryFee,
      discount,
      total: subtotal + deliveryFee - discount
    };

  } catch (error) {
    console.error('Erreur calcul frais:', error);
    return {
      deliveryFee: 720,
      discount: 0,
      total: subtotal + 720
    };
  }
};

module.exports = {
  getDeliverySettings,
  updateDeliverySettings,
  calculateDeliveryFees
};
