const mongoose = require('mongoose');

const SubscriptionPricingSchema = new mongoose.Schema({
  // Clé de singleton pour garantir un seul document logique
  key: { type: String, default: 'SUBSCRIPTION_PRICING_SINGLETON' },
  prixMensuel: { type: Number, default: 5000 }, // Prix de l'abonnement mensuel en FCFA
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Assurer l'unicité du document singleton
SubscriptionPricingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('SubscriptionPricing', SubscriptionPricingSchema);

