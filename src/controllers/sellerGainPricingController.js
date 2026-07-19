const SellerGainPricing = require('../models/SellerGainPricing');
const {
  DEFAULT_GAIN_VOITURE,
  DEFAULT_GAIN_MOTO,
} = require('../utils/sellerGainPricing');

exports.getSellerGainPricing = async (_req, res) => {
  try {
    let pricing = await SellerGainPricing.findOne({ key: 'SELLER_GAIN_PRICING_SINGLETON' });
    if (!pricing) {
      pricing = new SellerGainPricing({
        key: 'SELLER_GAIN_PRICING_SINGLETON',
        gainVoiture: DEFAULT_GAIN_VOITURE,
        gainMoto: DEFAULT_GAIN_MOTO,
      });
      await pricing.save();
    }
    res.status(200).json({
      gainVoiture: Number(pricing.gainVoiture) || DEFAULT_GAIN_VOITURE,
      gainMoto: Number(pricing.gainMoto) || DEFAULT_GAIN_MOTO,
      pricing,
    });
  } catch (error) {
    console.error('Error fetching seller gain pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateSellerGainPricing = async (req, res) => {
  try {
    const { gainVoiture, gainMoto } = req.body;
    if (gainVoiture === undefined && gainMoto === undefined) {
      return res.status(400).json({ message: 'gainVoiture ou gainMoto requis' });
    }

    const update = { updatedAt: new Date() };
    if (gainVoiture !== undefined && gainVoiture !== null) {
      const parsedVoiture = Number(gainVoiture);
      if (!Number.isFinite(parsedVoiture) || parsedVoiture < 0) {
        return res.status(400).json({ message: 'gainVoiture invalide' });
      }
      update.gainVoiture = Math.round(parsedVoiture);
    }
    if (gainMoto !== undefined && gainMoto !== null) {
      const parsedMoto = Number(gainMoto);
      if (!Number.isFinite(parsedMoto) || parsedMoto < 0) {
        return res.status(400).json({ message: 'gainMoto invalide' });
      }
      update.gainMoto = Math.round(parsedMoto);
    }

    const pricing = await SellerGainPricing.findOneAndUpdate(
      { key: 'SELLER_GAIN_PRICING_SINGLETON' },
      {
        $set: update,
        $setOnInsert: {
          key: 'SELLER_GAIN_PRICING_SINGLETON',
          createdAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: 'Seller gain pricing updated successfully',
      gainVoiture: pricing.gainVoiture,
      gainMoto: pricing.gainMoto,
      pricing,
    });
  } catch (error) {
    console.error('Error updating seller gain pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
