const VerificationPricing = require('../models/VerificationPricing');
const { DEFAULT_VERIFICATION_PRICE } = require('../utils/verificationPricing');

exports.getVerificationPricing = async (_req, res) => {
  try {
    let pricing = await VerificationPricing.findOne({ key: 'VERIFICATION_PRICING_SINGLETON' });
    if (!pricing) {
      pricing = new VerificationPricing({
        key: 'VERIFICATION_PRICING_SINGLETON',
        prixVerification: DEFAULT_VERIFICATION_PRICE,
      });
      await pricing.save();
    }
    res.status(200).json({
      prixVerification: Number(pricing.prixVerification) || DEFAULT_VERIFICATION_PRICE,
      pricing,
    });
  } catch (error) {
    console.error('Error fetching verification pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateVerificationPricing = async (req, res) => {
  try {
    const { prixVerification } = req.body;
    if (prixVerification === undefined || prixVerification === null) {
      return res.status(400).json({ message: 'prixVerification requis' });
    }
    const parsed = Number(prixVerification);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ message: 'prixVerification invalide' });
    }

    const pricing = await VerificationPricing.findOneAndUpdate(
      { key: 'VERIFICATION_PRICING_SINGLETON' },
      {
        $set: {
          key: 'VERIFICATION_PRICING_SINGLETON',
          prixVerification: Math.round(parsed),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: 'Verification pricing updated successfully',
      prixVerification: pricing.prixVerification,
      pricing,
    });
  } catch (error) {
    console.error('Error updating verification pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
