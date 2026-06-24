const TransitaireSubscriptionPricing = require('../models/TransitaireSubscriptionPricing');

exports.getTransitaireSubscriptionPricing = async (_req, res) => {
  try {
    let pricing = await TransitaireSubscriptionPricing.findOne({
      key: 'TRANSITAIRE_SUBSCRIPTION_PRICING_SINGLETON',
    });
    if (!pricing) {
      pricing = new TransitaireSubscriptionPricing({
        key: 'TRANSITAIRE_SUBSCRIPTION_PRICING_SINGLETON',
        prixMensuel: 5000,
      });
      await pricing.save();
    }
    res.status(200).json(pricing);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateTransitaireSubscriptionPricing = async (req, res) => {
  try {
    const { prixMensuel } = req.body;

    if (prixMensuel === undefined || prixMensuel === null) {
      return res.status(400).json({ message: 'Prix mensuel requis' });
    }
    if (prixMensuel < 0) {
      return res.status(400).json({ message: 'Prix mensuel invalide' });
    }

    const pricing = await TransitaireSubscriptionPricing.findOneAndUpdate(
      { key: 'TRANSITAIRE_SUBSCRIPTION_PRICING_SINGLETON' },
      {
        $set: {
          key: 'TRANSITAIRE_SUBSCRIPTION_PRICING_SINGLETON',
          prixMensuel: Math.round(Number(prixMensuel)),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { new: true, upsert: true }
    );

    res.status(200).json({
      message: 'Transitaire subscription pricing updated successfully',
      pricing,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
