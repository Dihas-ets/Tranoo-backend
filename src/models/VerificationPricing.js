const mongoose = require('mongoose');

const VerificationPricingSchema = new mongoose.Schema({
  key: { type: String, default: 'VERIFICATION_PRICING_SINGLETON' },
  prixVerification: { type: Number, default: 20000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

VerificationPricingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('VerificationPricing', VerificationPricingSchema);
