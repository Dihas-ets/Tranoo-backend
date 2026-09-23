const LayawaySettings = require('../../models/LayawaySettings');
const { DEFAULTS, SINGLETON_KEY } = require('../../models/LayawaySettings');

async function ensureSettingsDoc() {
  let doc = await LayawaySettings.findOne({ key: SINGLETON_KEY });
  if (!doc) {
    doc = new LayawaySettings({ key: SINGLETON_KEY, ...DEFAULTS });
    await doc.save();
  }
  return doc;
}

function serialize(doc) {
  return {
    guaranteePercentage: doc.guaranteePercentage,
    retentionPercentage: doc.retentionPercentage,
    maxDurationMonths: doc.maxDurationMonths,
    delayGracePeriodDays: doc.delayGracePeriodDays,
    defaultThresholdMonths: doc.defaultThresholdMonths,
    allowedFrequencies: doc.allowedFrequencies,
    allowedDurationsMonths: doc.allowedDurationsMonths,
    currency: doc.currency,
    defaultContractDocumentUrl: doc.defaultContractDocumentUrl || null,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Snapshot à copier dans le dossier au moment de l'engagement.
 * Les changements admin ultérieurs ne doivent pas modifier ce snapshot.
 */
function toAppliedParameters(doc) {
  return {
    guaranteePercentage: doc.guaranteePercentage,
    retentionPercentage: doc.retentionPercentage,
    maxDurationMonths: doc.maxDurationMonths,
    delayGracePeriodDays: doc.delayGracePeriodDays,
    defaultThresholdMonths: doc.defaultThresholdMonths,
    currency: doc.currency,
    snapshottedAt: new Date(),
  };
}

module.exports = {
  ensureSettingsDoc,
  serialize,
  toAppliedParameters,
  DEFAULTS,
};
