const Payment = require('../models/Payment');
const Delivery = require('../models/Delivery');
const LivreurBalance = require('../models/LivreurBalance');

const VENDOR_DEBIT_TYPES = ['subscription', 'publicite', 'verification'];

function vendorUserKeys(userId) {
  return [userId, String(userId)];
}

function paymentLabel(payment) {
  const desc = (payment.description || '').trim();
  if (desc) return desc;
  switch (payment.type) {
    case 'vente':
      return 'Crédit vente';
    case 'subscription':
      return 'Abonnement';
    case 'publicite':
      return 'Publicité';
    case 'verification':
      return 'Vérification';
    case 'achat':
      return 'Achat';
    default:
      return 'Transaction';
  }
}

/** `in` = crédit, `out` = débit, null = ignorer pour le solde */
function paymentFlowType(payment) {
  const t = String(payment.type || '').toLowerCase();
  const status = String(payment.status || '').toLowerCase();
  if (status !== 'success') return null;
  if (t === 'vente') return 'in';
  if (VENDOR_DEBIT_TYPES.includes(t)) return 'out';
  if (t === 'in') return 'in';
  if (t === 'out') return 'out';
  return null;
}

function mapPaymentToTransaction(payment, devise) {
  const flow = paymentFlowType(payment);
  if (!flow) return null;
  return {
    id: payment._id,
    type: flow,
    amount: Number(payment.amount) || 0,
    currency: payment.currency || devise || 'XOF',
    label: paymentLabel(payment),
    date: payment.createdAt || new Date(),
    status: payment.status,
    rawType: payment.type,
  };
}

async function computeVendorWalletBalance(userId) {
  const keys = vendorUserKeys(userId);
  const result = await Payment.aggregate([
    { $match: { user: { $in: keys }, status: 'success' } },
    {
      $group: {
        _id: null,
        totalIn: {
          $sum: {
            $cond: [{ $eq: ['$type', 'vente'] }, '$amount', 0],
          },
        },
        totalOut: {
          $sum: {
            $cond: [
              { $in: ['$type', VENDOR_DEBIT_TYPES] },
              '$amount',
              0,
            ],
          },
        },
      },
    },
  ]);
  if (!result || !result[0]) return 0;
  const { totalIn = 0, totalOut = 0 } = result[0];
  return Math.max(0, Math.round(Number(totalIn) - Number(totalOut)));
}

// Retourne le solde de l'utilisateur connecté et la devise
exports.getMyWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;

    if (role === 'livreur' && LivreurBalance && LivreurBalance.findOne) {
      const b = await LivreurBalance.findOne({ livreur: userId }).lean();
      return res.json({
        balance: b?.balance || 0,
        currency: req.user.devise || 'XOF',
      });
    }

    if (role === 'vendeur') {
      const balance = await computeVendorWalletBalance(userId);
      return res.json({ balance, currency: req.user.devise || 'XOF' });
    }

    let balance = 0;
    try {
      if (Payment && Payment.aggregate) {
        const keys = vendorUserKeys(userId);
        const result = await Payment.aggregate([
          { $match: { user: { $in: keys }, status: 'success' } },
          {
            $group: {
              _id: '$user',
              totalIn: {
                $sum: {
                  $cond: [{ $eq: ['$type', 'vente'] }, '$amount', 0],
                },
              },
              totalOut: {
                $sum: {
                  $cond: [
                    { $in: ['$type', VENDOR_DEBIT_TYPES] },
                    '$amount',
                    0,
                  ],
                },
              },
            },
          },
        ]);
        if (result && result.length > 0) {
          const { totalIn = 0, totalOut = 0 } = result[0];
          balance = Math.max(0, Math.round(Number(totalIn) - Number(totalOut)));
        }
      }
    } catch (_) {}

    res.json({ balance, currency: req.user.devise || 'XOF' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur wallet', error: err.message });
  }
};

exports.getMyTransactions = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;
    const transactions = [];
    const devise = req.user.devise || 'XOF';

    if (role === 'livreur' && LivreurBalance && LivreurBalance.findOne) {
      const b = await LivreurBalance.findOne({ livreur: userId }).lean();
      const txs = Array.isArray(b?.transactions) ? b.transactions : [];
      txs.sort((a, z) => new Date(z.createdAt || 0) - new Date(a.createdAt || 0));
      for (const t of txs.slice(0, 50)) {
        const isCredit =
          String(t.type || '').toLowerCase() === 'gain' ||
          String(t.type || '').toLowerCase() === 'ajustement';
        const amount = Number(t.montant || 0);
        const prettyAmount = Math.round(amount);
        transactions.push({
          id: t._id,
          type: isCredit ? 'in' : 'out',
          amount,
          currency: devise,
          label:
            t.description ||
            (isCredit
              ? `Votre compte a été rechargé de ${prettyAmount} ${devise}`
              : `Retrait de ${prettyAmount} ${devise}`),
          date: t.createdAt || new Date(),
        });
      }
      return res.json({ transactions });
    }

    const keys = vendorUserKeys(userId);
    try {
      if (Payment && Payment.find) {
        const pays = await Payment.find({ user: { $in: keys } })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean();
        for (const p of pays) {
          const tx = mapPaymentToTransaction(p, devise);
          if (tx) transactions.push(tx);
        }
      }
    } catch (_) {}

    res.json({ transactions });
  } catch (err) {
    res.status(500).json({ message: 'Erreur transactions', error: err.message });
  }
};

exports.getMyWalletStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.user.role;

    const stats = {
      totalOrders: 0,
      totalKm: 0,
      totalRevenueFcfa: 0,
      weeklyData: [0, 0, 0, 0, 0, 0, 0],
    };

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    startOfWeek.setHours(0, 0, 0, 0);

    if (role === 'vendeur' && Payment && Payment.aggregate) {
      const keys = vendorUserKeys(userId);
      const [totals, weekByDay] = await Promise.all([
        Payment.aggregate([
          {
            $match: {
              user: { $in: keys },
              type: 'vente',
              status: 'success',
            },
          },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalRevenueFcfa: { $sum: '$amount' },
            },
          },
        ]),
        Payment.aggregate([
          {
            $match: {
              user: { $in: keys },
              type: 'vente',
              status: 'success',
              createdAt: { $gte: startOfWeek },
            },
          },
          {
            $group: {
              _id: { $dayOfWeek: '$createdAt' },
              amount: { $sum: '$amount' },
            },
          },
        ]),
      ]);

      if (totals && totals[0]) {
        stats.totalOrders = totals[0].totalOrders || 0;
        stats.totalRevenueFcfa = Math.round(totals[0].totalRevenueFcfa || 0);
        stats.totalKm = stats.totalRevenueFcfa;
      }
      (weekByDay || []).forEach((d) => {
        const idx = (d._id - 2 + 7) % 7;
        if (idx >= 0 && idx < 7) {
          stats.weeklyData[idx] = Math.round(d.amount || 0);
        }
      });
      return res.json(stats);
    }

    if (role === 'livreur' && Delivery && Delivery.aggregate) {
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
