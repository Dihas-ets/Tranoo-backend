const SubscriptionPricing = require('../models/SubscriptionPricing');

exports.getSubscriptionPricing = async (_req, res) => {
  try {
    console.log('[SUBSCRIPTION_PRICING][GET] ===== DÉBUT =====');
    // Toujours cibler le document singleton
    let pricing = await SubscriptionPricing.findOne({ key: 'SUBSCRIPTION_PRICING_SINGLETON' });
    if (!pricing) {
      console.warn('[SUBSCRIPTION_PRICING][GET] Aucun document trouvé, création défaut 5000');
      pricing = new SubscriptionPricing({
        key: 'SUBSCRIPTION_PRICING_SINGLETON',
        prixMensuel: 5000,
        freeTrialDays: 45,
      });
      await pricing.save();
    }
    console.log('[SUBSCRIPTION_PRICING][GET] Prix renvoyé:', pricing.prixMensuel);
    console.log('[SUBSCRIPTION_PRICING][GET] ===== FIN =====');
    res.status(200).json(pricing);
  } catch (error) {
    console.error('Error fetching subscription pricing:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateSubscriptionPricing = async (req, res) => {
  console.log('[SUBSCRIPTION_PRICING] ===== DÉBUT MISE À JOUR =====');
  console.log('[SUBSCRIPTION_PRICING] Body reçu:', req.body);
  try {
    const { prixMensuel, freeTrialDays } = req.body;

    if (
      (prixMensuel === undefined || prixMensuel === null) &&
      (freeTrialDays === undefined || freeTrialDays === null)
    ) {
      console.error('[SUBSCRIPTION_PRICING] ❌ Aucune valeur de mise à jour');
      return res.status(400).json({ message: 'Prix mensuel ou jours gratuits requis' });
    }

    if (prixMensuel !== undefined && prixMensuel !== null && prixMensuel < 0) {
      console.error('[SUBSCRIPTION_PRICING] ❌ Prix mensuel invalide:', prixMensuel);
      return res.status(400).json({ message: 'Prix mensuel invalide' });
    }
    if (freeTrialDays !== undefined && freeTrialDays !== null) {
      if (!Number.isFinite(Number(freeTrialDays)) || Number(freeTrialDays) < 0) {
        console.error('[SUBSCRIPTION_PRICING] ❌ freeTrialDays invalide:', freeTrialDays);
        return res.status(400).json({ message: 'Nombre de jours gratuits invalide' });
      }
    }

    console.log('[SUBSCRIPTION_PRICING] Prix mensuel:', prixMensuel);
    console.log('[SUBSCRIPTION_PRICING] freeTrialDays:', freeTrialDays);

    // Upsert sur le document singleton
    const updates = {
      $set: {
        key: 'SUBSCRIPTION_PRICING_SINGLETON',
        ...(prixMensuel !== undefined && prixMensuel !== null
          ? { prixMensuel: Math.round(Number(prixMensuel)) }
          : {}),
        ...(freeTrialDays !== undefined && freeTrialDays !== null
          ? { freeTrialDays: Number(freeTrialDays) }
          : {}),
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    };

    console.log('[SUBSCRIPTION_PRICING] Mise à jour MongoDB...');
    const pricing = await SubscriptionPricing.findOneAndUpdate(
      { key: 'SUBSCRIPTION_PRICING_SINGLETON' },
      updates,
      { new: true, upsert: true }
    );

    console.log('[SUBSCRIPTION_PRICING] ✅ Tarifs mis à jour avec succès');
    console.log('[SUBSCRIPTION_PRICING] Nouveau pricing:', pricing);
    console.log('[SUBSCRIPTION_PRICING] ===== FIN MISE À JOUR =====');
    res.status(200).json({ message: 'Subscription pricing updated successfully', pricing });
  } catch (error) {
    console.error('[SUBSCRIPTION_PRICING] ❌ Erreur:', error.message);
    console.error('[SUBSCRIPTION_PRICING] Stack:', error.stack);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

