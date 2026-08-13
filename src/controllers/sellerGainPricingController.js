const SellerGainPricing = require('../models/SellerGainPricing');
const {
  DEFAULT_CAR_TIERS,
  DEFAULT_GAIN_VOITURE,
  DEFAULT_GAIN_MOTO,
  normalizeCarTiers,
  serializePricing,
} = require('../utils/sellerGainPricing');

async function ensurePricingDoc() {
  let pricing = await SellerGainPricing.findOne({ key: 'SELLER_GAIN_PRICING_SINGLETON' });
  if (!pricing) {
    pricing = new SellerGainPricing({
      key: 'SELLER_GAIN_PRICING_SINGLETON',
      gainVoiture: DEFAULT_GAIN_VOITURE,
      gainMoto: DEFAULT_GAIN_MOTO,
      carTiers: DEFAULT_CAR_TIERS.map((t) => ({ ...t })),
    });
    await pricing.save();
  }
  return pricing;
}

exports.getSellerGainPricing = async (_req, res) => {
  try {
    const pricing = await ensurePricingDoc();
    const payload = serializePricing(pricing);
    res.status(200).json({
      ...payload,
      pricing,
    });
  } catch (error) {
    console.error('Error fetching seller gain pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateSellerGainPricing = async (req, res) => {
  try {
    const {
      gainVoiture,
      gainMoto,
      carTiers,
      motoNeuveGain,
      motoTricycleGain,
      motoPercentFrom,
      motoPercentRate,
    } = req.body;

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

    if (carTiers !== undefined) {
      const normalized = normalizeCarTiers(carTiers);
      if (!normalized.length) {
        return res.status(400).json({ message: 'carTiers invalide' });
      }
      update.carTiers = normalized;
    }

    const numericFields = [
      ['motoNeuveGain', motoNeuveGain],
      ['motoTricycleGain', motoTricycleGain],
      ['motoPercentFrom', motoPercentFrom],
      ['motoPercentRate', motoPercentRate],
    ];

    for (const [field, value] of numericFields) {
      if (value === undefined || value === null) continue;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return res.status(400).json({ message: `${field} invalide` });
      }
      update[field] = field === 'motoPercentRate' ? parsed : Math.round(parsed);
    }

    if (Object.keys(update).length === 1) {
      return res.status(400).json({ message: 'Aucune valeur à mettre à jour' });
    }

    const pricing = await SellerGainPricing.findOneAndUpdate(
      { key: 'SELLER_GAIN_PRICING_SINGLETON' },
      {
        $set: update,
        $setOnInsert: {
          key: 'SELLER_GAIN_PRICING_SINGLETON',
          createdAt: new Date(),
          carTiers: DEFAULT_CAR_TIERS.map((t) => ({ ...t })),
        },
      },
      { new: true, upsert: true }
    );

    const payload = serializePricing(pricing);
    res.status(200).json({
      message: 'Seller gain pricing updated successfully',
      ...payload,
      pricing,
    });
  } catch (error) {
    console.error('Error updating seller gain pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
