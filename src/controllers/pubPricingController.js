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
  console.log('[PUB_PRICING] ===== DÉBUT MISE À JOUR =====');
  console.log('[PUB_PRICING] Body reçu:', req.body);
  try {
    const { prixSponsoriseeParJour, prixALaUneParJour } = req.body;

    if (prixSponsoriseeParJour === undefined || prixALaUneParJour === undefined) {
      console.error('[PUB_PRICING] ❌ Données manquantes');
      return res.status(400).json({ message: 'prixSponsoriseeParJour et prixALaUneParJour requis' });
    }

    console.log('[PUB_PRICING] Valeurs:', { prixSponsoriseeParJour, prixALaUneParJour });

    // Upsert sur le document singleton
    const updates = {
      $set: {
        key: 'PUB_PRICING_SINGLETON',
        prixSponsoriseeParJour: Number(prixSponsoriseeParJour),
        prixALaUneParJour: Number(prixALaUneParJour),
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    };

    console.log('[PUB_PRICING] Mise à jour MongoDB...');
    const pricing = await PubPricing.findOneAndUpdate(
      { key: 'PUB_PRICING_SINGLETON' },
      updates,
      { new: true, upsert: true }
    );

    console.log('[PUB_PRICING] ✅ Tarifs mis à jour avec succès');
    console.log('[PUB_PRICING] Nouveau pricing:', pricing);
    console.log('[PUB_PRICING] ===== FIN MISE À JOUR =====');
    res.status(200).json({ message: 'Pub pricing updated successfully', pricing });
  } catch (error) {
    console.error('[PUB_PRICING] ❌ Erreur:', error.message);
    console.error('[PUB_PRICING] Stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};