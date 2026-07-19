const mongoose = require('mongoose');

const SellerGainPricingSchema = new mongoose.Schema({
  key: { type: String, default: 'SELLER_GAIN_PRICING_SINGLETON' },
  gainVoiture: { type: Number, default: 100000 },
  gainMoto: { type: Number, default: 50000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SellerGainPricingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('SellerGainPricing', SellerGainPricingSchema);
