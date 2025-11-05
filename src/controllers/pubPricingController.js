const PubPricing = require('../models/PubPricing');

exports.getPubPricing = async (_req, res) => {
  try {
    // Toujours cibler le document singleton
    let pricing = await PubPricing.findOne({ key: 'PUB_PRICING_SINGLETON' });
    if (!pricing) {
      pricing = new PubPricing({
        key: 'PUB_PRICING_SINGLETON',
        prixSponsoriseeParJour: 1000,
        prixALaUneParJour: 2000,
      });
      await pricing.save();
    }
    res.status(200).json(pricing);
  } catch (error) {
    console.error('Error fetching pub pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updatePubPricing = async (req, res) => {
  try {
    const { prixSponsoriseeParJour, prixALaUneParJour } = req.body;

    // Upsert sur le document singleton
    const updates = {
      $set: {
        key: 'PUB_PRICING_SINGLETON',
        prixSponsoriseeParJour,
        prixALaUneParJour,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    };

    const pricing = await PubPricing.findOneAndUpdate(
      { key: 'PUB_PRICING_SINGLETON' },
      updates,
      { new: true, upsert: true }
    );

    res.status(200).json({ message: 'Pub pricing updated successfully', pricing });
  } catch (error) {
    console.error('Error updating pub pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};