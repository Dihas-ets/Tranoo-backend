const mongoose = require('mongoose');

const TransitaireSubscriptionPricingSchema = new mongoose.Schema({
  key: { type: String, default: 'TRANSITAIRE_SUBSCRIPTION_PRICING_SINGLETON' },
  prixMensuel: { type: Number, default: 5000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

TransitaireSubscriptionPricingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model(
  'TransitaireSubscriptionPricing',
  TransitaireSubscriptionPricingSchema
);
