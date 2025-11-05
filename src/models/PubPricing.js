const mongoose = require('mongoose');

const PubPricingSchema = new mongoose.Schema({
  // Clé de singleton pour garantir un seul document logique
  key: { type: String, default: 'PUB_PRICING_SINGLETON' },
  prixSponsoriseeParJour: { type: Number, default: 1000 },
  prixALaUneParJour: { type: Number, default: 2000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Assurer l'unicité du document singleton
PubPricingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('PubPricing', PubPricingSchema);