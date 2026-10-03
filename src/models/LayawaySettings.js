const mongoose = require('mongoose');

const DEFAULTS = {
  /** @deprecated Garantie retirée de la logique métier finalisée */
  guaranteePercentage: 0,
  retentionPercentage: 20,
  maxDurationMonths: 24,
  delayGracePeriodDays: 15,
  /** Mois de régularisation après notification de retard */
  defaultThresholdMonths: 3,
  allowedFrequencies: ['DAILY', 'WEEKLY', 'MONTHLY'],
  allowedDurationsMonths: [6, 12, 18, 24],
  currency: 'XOF',
  defaultContractDocumentUrl: null,
};

const LayawaySettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'LAYAWAY_SETTINGS_SINGLETON' },
  /** @deprecated Ignoré par le flux métier (conservé pour compat admin / legacy) */
  guaranteePercentage: { type: Number, default: DEFAULTS.guaranteePercentage },
  retentionPercentage: { type: Number, default: DEFAULTS.retentionPercentage },
  maxDurationMonths: { type: Number, default: DEFAULTS.maxDurationMonths },
  delayGracePeriodDays: { type: Number, default: DEFAULTS.delayGracePeriodDays },
  defaultThresholdMonths: { type: Number, default: DEFAULTS.defaultThresholdMonths },
  allowedFrequencies: {
    type: [String],
    default: () => [...DEFAULTS.allowedFrequencies],
  },
  allowedDurationsMonths: {
    type: [Number],
    default: () => [...DEFAULTS.allowedDurationsMonths],
  },
  currency: { type: String, default: DEFAULTS.currency },
  /** URL du modèle de contrat Tranoo (PDF) associé aux nouveaux dossiers */
  defaultContractDocumentUrl: {
    type: String,
    default: null,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

LayawaySettingsSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('LayawaySettings', LayawaySettingsSchema);
module.exports.DEFAULTS = DEFAULTS;
module.exports.SINGLETON_KEY = 'LAYAWAY_SETTINGS_SINGLETON';
