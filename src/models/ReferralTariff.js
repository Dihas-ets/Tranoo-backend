const mongoose = require('mongoose');

const ReferralTariffSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "Parrainage Basic", "Premium"
  code: { type: String, required: true, unique: true }, // slug/code unique
  amount: { type: Number, required: true }, // Montant en devise (XOF)
  description: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ReferralTariffSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('ReferralTariff', ReferralTariffSchema);


