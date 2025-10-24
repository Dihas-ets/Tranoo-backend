const mongoose = require('mongoose');

const PubPricingSchema = new mongoose.Schema({
  prixSponsoriseeParJour: { type: Number, default: 1000 },
  prixALaUneParJour: { type: Number, default: 2000 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PubPricing', PubPricingSchema);