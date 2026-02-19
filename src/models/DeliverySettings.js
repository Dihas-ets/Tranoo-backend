const mongoose = require('mongoose');

const deliverySettingsSchema = new mongoose.Schema({
  // Anciens champs (compatibilité)
  deliveryFee: { type: Number, default: 720 },
  discount: { type: Number, default: 0 },
  freeDeliveryThreshold: { type: Number, default: 0 },
  enableDiscounts: { type: Boolean, default: false },
  enableFreeDelivery: { type: Boolean, default: false },
  estimatedDeliveryDays: { type: Number, default: 3 },
  
  // Nouveaux champs (géolocalisation + tarif/km)
  // Tarif par kilomètre (en FCFA) - PRIORITAIRE pour calcul dynamique
  pricePerKm: {
    type: Number,
    default: 75, // 75 FCFA par km par défaut
    required: true,
    min: 0,
  },
  
  // Rayon de recherche pour les livreurs proches (en km)
  searchRadiusKm: {
    type: Number,
    default: 10, // 10 km par défaut
    required: true,
    min: 1,
  },
  
  // Durée d'affichage de la notification (en secondes)
  notificationDisplayDuration: {
    type: Number,
    default: 60, // 60 secondes
    required: true,
    min: 10,
  },
  
  // Vitesse moyenne estimée pour calcul ETA (km/h)
  avgSpeedKmH: {
    type: Number,
    default: 25, // 25 km/h par défaut
    required: true,
    min: 1,
  },
  
  // Dernière modification
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// S'assurer qu'il n'y a qu'un seul document de settings
deliverySettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('DeliverySettings', deliverySettingsSchema);
