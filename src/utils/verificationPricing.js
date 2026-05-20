const VerificationPricing = require('../models/VerificationPricing');

const DEFAULT_VERIFICATION_PRICE = 20000;

async function getVerificationPriceFcfa() {
  let pricing = await VerificationPricing.findOne({ key: 'VERIFICATION_PRICING_SINGLETON' });
  if (!pricing) {
    pricing = new VerificationPricing({
      key: 'VERIFICATION_PRICING_SINGLETON',
      prixVerification: DEFAULT_VERIFICATION_PRICE,
    });
    await pricing.save();
  }
  const value = Number(pricing.prixVerification);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_VERIFICATION_PRICE;
}

module.exports = {
  DEFAULT_VERIFICATION_PRICE,
  getVerificationPriceFcfa,
};
