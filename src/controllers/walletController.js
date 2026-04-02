const Article = require('../models/Article');
const Payment = require('../models/Payment');
const Delivery = require('../models/Delivery');
const LivreurBalance = require('../models/LivreurBalance');

// Retourne le solde de l'utilisateur connecté et la devise
exports.getMyWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;

    // Source de vérité pour les livreurs: LivreurBalance (crédité à la livraison)
    if (role === 'livreur' && LivreurBalance && LivreurBalance.findOne) {
      const b = await LivreurBalance.findOne({ livreur: userId }).lean();
      return res.json({
        balance: b?.balance || 0,
        currency: req.user.devise || 'XOF',
      });
    }

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
    const role = req.user.role;
    const transactions = [];

    // Livreur: transactions depuis LivreurBalance
    if (role === 'livreur' && LivreurBalance && LivreurBalance.findOne) {
      const b = await LivreurBalance.findOne({ livreur: userId }).lean();
      const txs = Array.isArray(b?.transactions) ? b.transactions : [];
      // newest first
      txs.sort((a, z) => new Date(z.createdAt || 0) - new Date(a.createdAt || 0));
      for (const t of txs.slice(0, 50)) {
        const isCredit = String(t.type || '').toLowerCase() === 'gain' || String(t.type || '').toLowerCase() === 'ajustement';
        const amount = Number(t.montant || 0);
        const currency = req.user.devise || 'XOF';
        const prettyAmount = Math.round(amount);
        transactions.push({
          id: t._id,
          type: isCredit ? 'in' : 'out',
          amount,
          currency,
          label:
            t.description ||
            (isCredit
              ? `Votre compte a été rechargé de ${prettyAmount} ${currency}`
              : `Retrait de ${prettyAmount} ${currency}`),
          date: t.createdAt || new Date(),
        });
      }
      if (transactions.length === 0) {
        transactions.push({
          id: 'none',
          type: 'out',
          amount: 0,
          currency: req.user.devise || 'XOF',
          label: 'Aucune transaction',
          date: new Date(),
        });
      }
      return res.json({ transactions });
    }

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

// Stats pour livreur : commandes honorées, kilométrage, données hebdo
exports.getMyWalletStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;

    const stats = {
      totalOrders: 0,
      totalKm: 0,
      weeklyData: [0, 0, 0, 0, 0, 0, 0], // Lun-Dim
    };

    if (role === 'livreur' && Delivery && Delivery.aggregate) {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      startOfWeek.setHours(0, 0, 0, 0);

      const [totals, weekByDay] = await Promise.all([
        Delivery.aggregate([
          { $match: { livreur: userId, statut: 'livré' } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalKm: { $sum: { $ifNull: ['$distanceKm', 0] } },
            },
          },
        ]),
        Delivery.aggregate([
          {
            $match: {
              livreur: userId,
              statut: 'livré',
              dateLivraison: { $gte: startOfWeek },
            },
          },
          {
            $group: {
              _id: { $dayOfWeek: '$dateLivraison' },
              count: { $sum: 1 },
            },
          },
        ]),
      ]);

      if (totals && totals[0]) {
        stats.totalOrders = totals[0].totalOrders || 0;
        stats.totalKm = Math.round((totals[0].totalKm || 0) * 10) / 10;
      }
      // dayOfWeek: 1 = dimanche, 2 = lundi ... 7 = samedi → index 0 = lun, 6 = dim
      (weekByDay || []).forEach((d) => {
        const idx = (d._id - 2 + 7) % 7;
        if (idx >= 0 && idx < 7) stats.weeklyData[idx] = d.count || 0;
      });
    }

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Erreur stats wallet', error: err.message });
  }
};







