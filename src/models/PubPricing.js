const mongoose = require('mongoose');

const pubPricingSchema = new mongoose.Schema({
  prixSponsoriseeParJour: {
    type: Number,
    required: true,
    default: 1000
  },
  prixALaUneParJour: {
    type: Number,
    required: true,
    default: 2000
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('PubPricing', pubPricingSchema);