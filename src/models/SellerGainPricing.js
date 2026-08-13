const mongoose = require('mongoose');

const DEFAULT_CAR_TIERS = [
  { minPrice: 5500000, gain: 200000 },
  { minPrice: 2500000, gain: 100000 },
  { minPrice: 1500000, gain: 50000 },
];

const SellerGainPricingSchema = new mongoose.Schema({
  key: { type: String, default: 'SELLER_GAIN_PRICING_SINGLETON' },
  gainVoiture: { type: Number, default: 50000 },
  gainMoto: { type: Number, default: 5000 },
  carTiers: {
    type: [
      {
        minPrice: { type: Number, required: true },
        gain: { type: Number, required: true },
      },
    ],
    default: () => DEFAULT_CAR_TIERS.map((t) => ({ ...t })),
  },
  motoNeuveGain: { type: Number, default: 5000 },
  motoTricycleGain: { type: Number, default: 10000 },
  motoPercentFrom: { type: Number, default: 1500000 },
  motoPercentRate: { type: Number, default: 10 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SellerGainPricingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('SellerGainPricing', SellerGainPricingSchema);
module.exports.DEFAULT_CAR_TIERS = DEFAULT_CAR_TIERS;
