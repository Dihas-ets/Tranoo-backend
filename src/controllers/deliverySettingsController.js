const DeliverySettings = require('../models/DeliverySettings');

// Récupérer les paramètres de livraison
const getDeliverySettings = async (req, res) => {
  try {
    const settings = await DeliverySettings.getSettings();
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
      estimatedDeliveryDays,
      pricePerKm,
    } = req.body;

    // Validation des données
    if (deliveryFee != null && deliveryFee < 0) {
      return res.status(400).json({ message: 'Les frais de livraison ne peuvent pas être négatifs' });
    }

    if (discount != null && discount < 0) {
      return res.status(400).json({ message: 'La remise ne peut pas être négative' });
    }

    if (freeDeliveryThreshold != null && freeDeliveryThreshold < 0) {
      return res.status(400).json({ message: 'Le seuil de livraison gratuite ne peut pas être négatif' });
    }

    if (estimatedDeliveryDays != null && (estimatedDeliveryDays < 1 || estimatedDeliveryDays > 30)) {
      return res.status(400).json({ message: 'Le délai de livraison doit être entre 1 et 30 jours' });
    }
    if (pricePerKm != null && pricePerKm < 0) {
      return res.status(400).json({ message: 'pricePerKm invalide (doit être >= 0)' });
    }

    // Mettre à jour ou créer les paramètres
    const settings = await DeliverySettings.getSettings();

    if (deliveryFee != null) settings.deliveryFee = deliveryFee;
    if (discount != null) settings.discount = discount;
    if (freeDeliveryThreshold != null) settings.freeDeliveryThreshold = freeDeliveryThreshold;
    if (enableDiscounts != null) settings.enableDiscounts = enableDiscounts;
    if (enableFreeDelivery != null) settings.enableFreeDelivery = enableFreeDelivery;
    if (estimatedDeliveryDays != null) settings.estimatedDeliveryDays = estimatedDeliveryDays;
    if (pricePerKm != null) settings.pricePerKm = pricePerKm;
    settings.updatedBy = req.user?.id || req.user?._id || settings.updatedBy;
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
const calculateDeliveryFees = async (req, res) => {
  try {
    const subtotal = Number(req.query.subtotal ?? req.body?.subtotal ?? 0);
    const settings = await DeliverySettings.getSettings();

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

    return res.json({
      deliveryFee,
      discount,
      total: subtotal + deliveryFee - discount
    });

  } catch (error) {
    console.error('Erreur calcul frais:', error);
    return res.status(500).json({
      message: 'Erreur serveur lors du calcul des frais',
      error: error.message,
    });
  }
};

module.exports = {
  getDeliverySettings,
  updateDeliverySettings,
  calculateDeliveryFees
};
