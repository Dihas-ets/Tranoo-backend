const mongoose = require('mongoose');

const deliveryZoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  // Polygone de la zone (liste de coordonnées GPS)
  coordinates: [{
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
  }],
  // Tarif par km pour cette zone
  pricePerKm: {
    type: Number,
    required: true,
    default: 75, // 75 FCFA par km
  },
  // Tarif minimum pour cette zone
  minDeliveryFee: {
    type: Number,
    required: true,
    default: 500,
  },
  // Tarif maximum pour cette zone
  maxDeliveryFee: {
    type: Number,
    required: true,
    default: 5000,
  },
  // Zone active ou non
  isActive: {
    type: Boolean,
    default: true,
  },
  // Temps de livraison estimé (en heures)
  estimatedDeliveryTime: {
    type: Number,
    default: 24,
  },
  // Villes couvertes par cette zone
  coveredCities: [{
    type: String,
    trim: true,
  }],
}, {
  timestamps: true,
});

// Méthode pour vérifier si un point est dans la zone
deliveryZoneSchema.methods.isPointInZone = function(latitude, longitude) {
  if (this.coordinates.length < 3) return false;
  
  // Algorithme de ray casting pour déterminer si un point est dans un polygone
  let inside = false;
  const x = longitude;
  const y = latitude;
  
  for (let i = 0, j = this.coordinates.length - 1; i < this.coordinates.length; j = i++) {
    const xi = this.coordinates[i].longitude;
    const yi = this.coordinates[i].latitude;
    const xj = this.coordinates[j].longitude;
    const yj = this.coordinates[j].latitude;
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
};

// Méthode pour calculer les frais de livraison pour cette zone
deliveryZoneSchema.methods.calculateDeliveryFee = function(distanceKm) {
  let fee = distanceKm * this.pricePerKm;
  
  // Appliquer les bornes min/max
  fee = Math.max(fee, this.minDeliveryFee);
  fee = Math.min(fee, this.maxDeliveryFee);
  
  return Math.round(fee);
};

// Méthode statique pour trouver la zone d'un point
deliveryZoneSchema.statics.findZoneForPoint = async function(latitude, longitude) {
  const zones = await this.find({ isActive: true });
  
  for (const zone of zones) {
    if (zone.isPointInZone(latitude, longitude)) {
      return zone;
    }
  }
  
  return null;
};

module.exports = mongoose.model('DeliveryZone', deliveryZoneSchema);
