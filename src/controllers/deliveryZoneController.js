const DeliveryZone = require('../models/DeliveryZone');
const DeliverySettings = require('../models/DeliverySettings');

// Récupérer toutes les zones de livraison
exports.getDeliveryZones = async (req, res) => {
  try {
    const zones = await DeliveryZone.find({ isActive: true })
      .sort({ name: 1 });
    
    res.json({ 
      success: true,
      zones,
      total: zones.length
    });
  } catch (error) {
    console.error('Erreur getDeliveryZones:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Créer une nouvelle zone de livraison (admin uniquement)
exports.createDeliveryZone = async (req, res) => {
  try {
    const {
      name,
      description,
      coordinates,
      pricePerKm,
      minDeliveryFee,
      maxDeliveryFee,
      estimatedDeliveryTime,
      coveredCities
    } = req.body;

    if (!name || !coordinates || coordinates.length < 3) {
      return res.status(400).json({ 
        message: 'Nom et coordonnées (min 3 points) requis' 
      });
    }

    const zone = await DeliveryZone.create({
      name,
      description,
      coordinates,
      pricePerKm: pricePerKm || 75, // 75 FCFA par km par défaut
      minDeliveryFee: minDeliveryFee || 500,
      maxDeliveryFee: maxDeliveryFee || 5000,
      estimatedDeliveryTime: estimatedDeliveryTime || 24,
      coveredCities: coveredCities || [],
    });

    res.status(201).json({ 
      success: true,
      message: 'Zone de livraison créée avec succès',
      zone
    });
  } catch (error) {
    console.error('Erreur createDeliveryZone:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Mettre à jour une zone de livraison (admin uniquement)
exports.updateDeliveryZone = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const zone = await DeliveryZone.findByIdAndUpdate(
      id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!zone) {
      return res.status(404).json({ message: 'Zone de livraison introuvable' });
    }

    res.json({ 
      success: true,
      message: 'Zone de livraison mise à jour avec succès',
      zone
    });
  } catch (error) {
    console.error('Erreur updateDeliveryZone:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Supprimer une zone de livraison (admin uniquement)
exports.deleteDeliveryZone = async (req, res) => {
  try {
    const { id } = req.params;

    const zone = await DeliveryZone.findByIdAndDelete(id);

    if (!zone) {
      return res.status(404).json({ message: 'Zone de livraison introuvable' });
    }

    res.json({ 
      success: true,
      message: 'Zone de livraison supprimée avec succès'
    });
  } catch (error) {
    console.error('Erreur deleteDeliveryZone:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Trouver la zone pour un point GPS
exports.getZoneForPoint = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({ 
        message: 'Latitude et longitude requis' 
      });
    }

    const zone = await DeliveryZone.findZoneForPoint(
      parseFloat(latitude), 
      parseFloat(longitude)
    );

    if (!zone) {
      return res.json({ 
        success: false,
        message: 'Aucune zone de livraison trouvée pour ce point',
        zone: null
      });
    }

    res.json({ 
      success: true,
      zone
    });
  } catch (error) {
    console.error('Erreur getZoneForPoint:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Calculer les frais de livraison avec zones
exports.calculateDeliveryFeeWithZones = async (req, res) => {
  try {
    const { supplier_lat, supplier_lng, delivery_lat, delivery_lng } = req.body;
    console.log(
      '[DELIVERY_ZONE_CALC] input supplier=(%s,%s) delivery=(%s,%s)',
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
    const haversineKm = (lat1, lon1, lat2, lon2) => {
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
    };
    
    const distanceKm = haversineKm(
      parseFloat(supplier_lat), 
      parseFloat(supplier_lng), 
      parseFloat(delivery_lat), 
      parseFloat(delivery_lng)
    );
    
    // Chercher la zone de livraison pour le point de livraison
    const deliveryZone = await DeliveryZone.findZoneForPoint(
      parseFloat(delivery_lat), 
      parseFloat(delivery_lng)
    );
    
    let deliveryFee;
    let zoneInfo = null;
    
    if (deliveryZone) {
      // Utiliser les tarifs de la zone
      deliveryFee = deliveryZone.calculateDeliveryFee(distanceKm);
      zoneInfo = {
        name: deliveryZone.name,
        pricePerKm: deliveryZone.pricePerKm,
        minDeliveryFee: deliveryZone.minDeliveryFee,
        maxDeliveryFee: deliveryZone.maxDeliveryFee,
        estimatedDeliveryTime: deliveryZone.estimatedDeliveryTime,
      };
    } else {
      // Utiliser les settings par défaut
      const settings = await DeliverySettings.getSettings();
      const billedKm = distanceKm > 0 && distanceKm < 1 ? 1 : distanceKm;
      deliveryFee = Math.round(billedKm * settings.pricePerKm);
      console.log(
        '[DELIVERY_ZONE_CALC] no zone, using settings pricePerKm=%s distanceKm=%s billedKm=%s fee=%s',
        settings.pricePerKm,
        distanceKm,
        billedKm,
        deliveryFee
      );
      zoneInfo = {
        name: 'Zone standard',
        pricePerKm: settings.pricePerKm,
        minDeliveryFee: 0,
        maxDeliveryFee: null,
        estimatedDeliveryTime: 48,
      };
    }
    
    res.json({ 
      success: true,
      distanceKm: Math.round(distanceKm * 100) / 100,
      deliveryFee,
      zoneInfo,
      isInZone: deliveryZone !== null
    });
  } catch (error) {
    console.error('Erreur calculateDeliveryFeeWithZones:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};
