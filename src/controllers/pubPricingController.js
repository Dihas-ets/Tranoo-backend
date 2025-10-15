const PubPricing = require('../models/PubPricing');

// Récupérer la configuration des prix
exports.getPubPricing = async (req, res) => {
  try {
    console.log('[DEBUG] GET pub-pricing appelé');
    let pricing = await PubPricing.findOne().sort({ createdAt: -1 });
    console.log('[DEBUG] Pricing trouvé:', pricing);
    
    if (!pricing) {
      // Créer une configuration par défaut si elle n'existe pas
      pricing = new PubPricing({
        prixSponsoriseeParJour: 1000,
        prixALaUneParJour: 2000,
        updatedBy: 'system'
      });
      await pricing.save();
    }
    
    res.json({
      prixSponsoriseeParJour: pricing.prixSponsoriseeParJour,
      prixALaUneParJour: pricing.prixALaUneParJour,
      lastUpdated: pricing.lastUpdated
    });
  } catch (error) {
    console.error('Erreur récupération prix pub:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Mettre à jour la configuration des prix (admin seulement)
exports.updatePubPricing = async (req, res) => {
  try {
    console.log('[DEBUG] PUT pub-pricing appelé avec:', req.body);
    const { prixSponsoriseeParJour, prixALaUneParJour } = req.body;
    
    if (!prixSponsoriseeParJour || prixSponsoriseeParJour <= 0 || !prixALaUneParJour || prixALaUneParJour <= 0) {
      return res.status(400).json({ message: 'Prix invalides' });
    }
    
    const pricing = new PubPricing({
      prixSponsoriseeParJour,
      prixALaUneParJour,
      updatedBy: req.user?.email || 'admin'
    });
    
    await pricing.save();
    
    res.json({
      message: 'Prix mis à jour avec succès',
      prixSponsoriseeParJour: pricing.prixSponsoriseeParJour,
      prixALaUneParJour: pricing.prixALaUneParJour
    });
  } catch (error) {
    console.error('Erreur mise à jour prix pub:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};