const Article = require('../models/Article');
const Payment = require('../models/Payment');

// Retourne le solde de l'utilisateur connecté et la devise
exports.getMyWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    // Exemple de calcul simple basé sur le modèle Payment si disponible
    // Sinon, retourne 0 par défaut
    let balance = 0;
    try {
      if (Payment && Payment.aggregate) {
        const result = await Payment.aggregate([
          { $match: { user: userId } },
          {
            $group: {
              _id: '$user',
              totalIn: {
                $sum: {
                  $cond: [{ $eq: ['$type', 'in'] }, '$amount', 0],
                },
              },
              totalOut: {
                $sum: {
                  $cond: [{ $eq: ['$type', 'out'] }, '$amount', 0],
                },
              },
            },
          },
        ]);
        if (result && result.length > 0) {
          const { totalIn = 0, totalOut = 0 } = result[0];
          balance = Number(totalIn) - Number(totalOut);
        }
      }
    } catch (_) {}

    res.json({ balance, currency: req.user.devise || 'XOF' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur wallet', error: err.message });
  }
};

// Retourne une liste de transactions (mock si pas de modèle)
exports.getMyTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const transactions = [];
    try {
      if (Payment && Payment.find) {
        const pays = await Payment.find({ user: userId })
          .sort({ createdAt: -1 })
          .limit(50);
        for (const p of pays) {
          transactions.push({
            id: p._id,
            type: p.type || 'out',
            amount: p.amount || 0,
            currency: p.currency || req.user.devise || 'XOF',
            label: p.label || 'Paiement',
            date: p.createdAt || new Date(),
          });
        }
      }
    } catch (_) {}

    // Fallback si aucune transaction
    if (transactions.length === 0) {
      transactions.push({
        id: 'sample-1',
        type: 'out',
        amount: 0,
        currency: req.user.devise || 'XOF',
        label: 'Aucune transaction',
        date: new Date(),
      });
    }

    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ message: 'Erreur transactions', error: err.message });
  }
};







