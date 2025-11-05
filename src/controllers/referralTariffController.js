const ReferralTariff = require('../models/ReferralTariff');

exports.listTariffs = async (_req, res) => {
  try {
    const tariffs = await ReferralTariff.find().sort({ createdAt: -1 });
    res.json(tariffs);
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la récupération des tarifs', error: err.message });
  }
};

exports.createTariff = async (req, res) => {
  try {
    const { name, code, amount, description, isActive } = req.body;
    const exists = await ReferralTariff.findOne({ code });
    if (exists) return res.status(400).json({ message: 'Code tarif déjà existant' });
    const tariff = new ReferralTariff({ name, code, amount, description, isActive });
    await tariff.save();
    res.status(201).json({ message: 'Tarif créé', tariff });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la création du tarif', error: err.message });
  }
};

exports.updateTariff = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = { ...req.body, updatedAt: new Date() };
    const tariff = await ReferralTariff.findByIdAndUpdate(id, updates, { new: true });
    if (!tariff) return res.status(404).json({ message: 'Tarif non trouvé' });
    res.json({ message: 'Tarif mis à jour', tariff });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour du tarif', error: err.message });
  }
};

exports.deleteTariff = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ReferralTariff.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ message: 'Tarif non trouvé' });
    res.json({ message: 'Tarif supprimé' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la suppression du tarif', error: err.message });
  }
};


