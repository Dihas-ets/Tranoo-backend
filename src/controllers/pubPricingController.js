const PubPricing = require('../models/PubPricing');

exports.getPubPricing = async (_req, res) => {
  try {
    let pricing = await PubPricing.findOne();
    if (!pricing) {
      pricing = new PubPricing({
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
    let pricing = await PubPricing.findOne();

    if (!pricing) {
      pricing = new PubPricing({
        prixSponsoriseeParJour,
        prixALaUneParJour,
      });
    } else {
      pricing.prixSponsoriseeParJour = prixSponsoriseeParJour;
      pricing.prixALaUneParJour = prixALaUneParJour;
      pricing.updatedAt = Date.now();
    }

    await pricing.save();
    res.status(200).json({ message: 'Pub pricing updated successfully', pricing });
  } catch (error) {
    console.error('Error updating pub pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};