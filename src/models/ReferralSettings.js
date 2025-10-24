const mongoose = require('mongoose');

const ReferralSettingsSchema = new mongoose.Schema({
  isActive: { type: Boolean, default: true },
  rewardAmount: { type: Number, default: 500 }, // Récompense en FCFA
  minReferrals: { type: Number, default: 1 }, // Nombre minimum de parrainages pour recevoir la récompense
  maxReferrals: { type: Number, default: 10 }, // Nombre maximum de parrainages par utilisateur
  description: { type: String, default: 'Parrainez vos amis et gagnez des récompenses !' },
  terms: { type: String, default: 'Conditions générales du programme de parrainage' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ReferralSettings', ReferralSettingsSchema);
