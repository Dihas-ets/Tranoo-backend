const LivreurBalance = require('../models/LivreurBalance');
const User = require('../models/User');

// Récupérer la balance du livreur connecté
exports.getMyBalance = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== 'livreur') {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }

    const balanceDoc = await LivreurBalance.findOne({ livreur: user._id }).lean();

    res.json({
      balance: balanceDoc?.balance || 0,
      totalGains: balanceDoc?.totalGains || 0,
      totalRetraits: balanceDoc?.totalRetraits || 0,
      nombreLivraisons: balanceDoc?.nombreLivraisons || 0,
      nombreLivraisonsReussies: balanceDoc?.nombreLivraisonsReussies || 0,
      nombreLivraisonsRefusees: balanceDoc?.nombreLivraisonsRefusees || 0,
      currency: user.devise || 'XOF',
      lastUpdated: balanceDoc?.lastUpdated || null,
    });
  } catch (err) {
    console.error('Erreur getMyBalance livreur:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

// Historique des transactions du livreur connecté
exports.getMyTransactions = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== 'livreur') {
      return res.status(403).json({ message: 'Accès réservé aux livreurs' });
    }

    const balanceDoc = await LivreurBalance.findOne({ livreur: user._id }).lean();
    const transactions = balanceDoc?.transactions || [];

    res.json({ transactions });
  } catch (err) {
    console.error('Erreur getMyTransactions livreur:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

// Récupérer le résumé balance d'un livreur (admin)
exports.getLivreurBalanceForAdmin = async (req, res) => {
  try {
    const livreurId = req.params.id;
    const user = await User.findById(livreurId).lean();
    if (!user || user.role !== 'livreur') {
      return res.status(404).json({ message: 'Livreur non trouvé' });
    }

    const balanceDoc = await LivreurBalance.findOne({ livreur: livreurId }).lean();

    res.json({
      livreur: {
        id: user._id,
        uid: user.uid,
        nom: user.nom,
        prenoms: user.prenoms,
        email: user.email,
        telephone: user.telephone,
      },
      balance: balanceDoc?.balance || 0,
      totalGains: balanceDoc?.totalGains || 0,
      totalRetraits: balanceDoc?.totalRetraits || 0,
      nombreLivraisons: balanceDoc?.nombreLivraisons || 0,
      nombreLivraisonsReussies: balanceDoc?.nombreLivraisonsReussies || 0,
      nombreLivraisonsRefusees: balanceDoc?.nombreLivraisonsRefusees || 0,
      lastUpdated: balanceDoc?.lastUpdated || null,
    });
  } catch (err) {
    console.error('Erreur getLivreurBalanceForAdmin:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

// Liste paginée des balances livreurs (admin)
exports.getAllLivreurBalancesForAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const balances = await LivreurBalance.find({})
      .populate('livreur', 'nom prenoms email telephone role')
      .sort({ lastUpdated: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();

    const total = await LivreurBalance.countDocuments({});

    res.json({
      balances,
      total,
      currentPage: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error('Erreur getAllLivreurBalancesForAdmin:', err);
    res.status(500).json({ message: 'Erreur serveur', error: err.message });
  }
};

