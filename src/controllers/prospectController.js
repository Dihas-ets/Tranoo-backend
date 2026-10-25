const PersonneInteressee = require('../models/PersonneInteressee');
const User = require('../models/User');

exports.getInstallmentPaymentStats = async (req, res) => {
  try {
    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Math.min(
      100,
      Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 25,
    );
    const search = String(req.query.search || '').trim();
    const filter = { prospect: true };

    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { nom: { $regex: escapedSearch, $options: 'i' } },
        { prenoms: { $regex: escapedSearch, $options: 'i' } },
        { email: { $regex: escapedSearch, $options: 'i' } },
        { telephone: { $regex: escapedSearch, $options: 'i' } },
      ];
    }

    const [counter, totalProspects, totalFiltered, prospects] = await Promise.all([
      PersonneInteressee.findById('installment_payment_clicks').lean(),
      User.countDocuments({ prospect: true }),
      User.countDocuments(filter),
      User.find(filter)
        .select('nom prenoms email telephone dateInscription')
        .sort({ dateInscription: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    return res.status(200).json({
      totalClics: counter?.personneInteresse || 0,
      totalProspects,
      totalFiltered,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(totalFiltered / limit)),
      prospects,
    });
  } catch (error) {
    console.error('[PROSPECT] Erreur chargement statistiques paiement échelonné:', error);
    return res.status(500).json({
      message: 'Erreur lors du chargement des statistiques prospects',
    });
  }
};

exports.trackInstallmentPaymentClick = async (req, res) => {
  try {
    const counter = await PersonneInteressee.findByIdAndUpdate(
      'installment_payment_clicks',
      { $inc: { personneInteresse: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );

    if (req.firebaseUid) {
      await User.updateOne(
        { uid: req.firebaseUid, prospect: { $ne: true } },
        { $set: { prospect: true } },
      );
    }

    return res.status(200).json({
      message: 'Clic de paiement échelonné enregistré',
      totalClics: counter.personneInteresse,
    });
  } catch (error) {
    console.error('[PROSPECT] Erreur enregistrement clic paiement échelonné:', error);
    return res.status(500).json({
      message: 'Erreur lors de l’enregistrement du clic',
    });
  }
};

exports.markInstallmentPaymentProspect = async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id, prospect: { $ne: true } },
      { $set: { prospect: true } },
    );

    return res.status(200).json({
      message: 'Intérêt paiement échelonné enregistré',
    });
  } catch (error) {
    console.error('[PROSPECT] Erreur mise à jour intérêt paiement échelonné:', error);
    return res.status(500).json({
      message: 'Erreur lors de l’enregistrement de votre intérêt',
    });
  }
};
