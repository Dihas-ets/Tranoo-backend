const User = require('../models/User');
const Article = require('../models/Article');
const Payment = require('../models/Payment');
const AgentEarning = require('../models/AgentEarning');

const MONTH_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

const paymentActivityLabel = (payment, articleType) => {
  const t = (payment.type || '').toLowerCase();
  if (t === 'publicite') return 'Publicité';
  if (t === 'subscription') return 'Abonnement';
  if (t === 'verification') return 'Vérification';
  if (t === 'vente' || t === 'achat') {
    return articleType === 'piece' ? 'Vente Pièce' : 'Vente Voiture';
  }
  return 'Autre';
};

const paymentStatusLabel = (status) => {
  if (status === 'success') return 'Confirmé';
  if (status === 'failed' || status === 'cancelled') return 'Refusé';
  return 'En attente';
};

const paymentMethodLabel = (method) => {
  if (!method) return '—';
  const m = String(method).toLowerCase();
  if (m.includes('momo') || m.includes('mtn') || m.includes('moov')) return 'Mobile Money';
  if (m.includes('card')) return 'Carte';
  return method;
};

exports.getStats = async (_req, res) => {
  try {
    // Fonction utilitaire pour calculer le statut dynamique
    async function computeUserStatut(user) {
      const now = new Date();
      if (user.role === 'vendeur') {
        const article = await Article.findOne({ vendeur: user._id });
        return article ? 'actif' : 'inactif';
      }
      if (user.role === 'acheteur') {
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(now.getMonth() - 6);
        const achat = await Article.findOne({ acheteur: user._id, statutVente: 'vendu', dateCreation: { $gte: sixMonthsAgo } });
        return achat ? 'actif' : 'inactif';
      }
      if (user.role === 'transitaire') {
        return 'inactif'; // TODO: implémenter la logique des propositions
      }
      if (user.role === 'chauffeur') {
        const article = await Article.findOne({ chauffeur: user._id });
        return article ? 'actif' : 'inactif';
      }
      if (user.role === 'admin') {
        if (!user.dernierAcces) return 'inactif';
        const oneMonthAgo = new Date(now);
        oneMonthAgo.setMonth(now.getMonth() - 1);
        return user.dernierAcces >= oneMonthAgo ? 'actif' : 'inactif';
      }
      return 'inactif';
    }

    // Comptes de base
    const acheteursCount = await User.countDocuments({ role: 'acheteur' });
    const chauffeursCount = await User.countDocuments({ role: 'chauffeur' });
    const transitairesCount = await User.countDocuments({ role: 'transitaire' });
    const clientsCount = acheteursCount + chauffeursCount + transitairesCount;
    const voituresCount = await Article.countDocuments({ type: 'voiture' });
    const piecesCount = await Article.countDocuments({ type: 'piece' });
    const usersCount = await User.countDocuments();
    const adminsCount = await User.countDocuments({ role: 'admin' });
    const vendeursCount = await User.countDocuments({ role: 'vendeur' });

    // Stats dynamiques pour vendeurs
    const vendeurs = await User.find({ role: 'vendeur' });
    let vendeursActifs = 0;
    let vendeursInactifs = 0;
    for (const vendeur of vendeurs) {
      const statut = await computeUserStatut(vendeur);
      if (statut === 'actif') vendeursActifs++;
      else vendeursInactifs++;
    }

    // Stats dynamiques pour admins
    const admins = await User.find({ role: 'admin' });
    let adminsActifs = 0;
    let adminsInactifs = 0;
    for (const admin of admins) {
      const statut = await computeUserStatut(admin);
      if (statut === 'actif') adminsActifs++;
      else adminsInactifs++;
    }

    // Année d'activité (depuis 2020)
    const launchYear = 2020;
    const currentYear = new Date().getFullYear();
    const anneeActivite = currentYear - launchYear + 1;

    res.json({
      voitures: Number(voituresCount),
      pieces: Number(piecesCount),
      clients: Number(clientsCount),
      chauffeurs: Number(chauffeursCount),
      transitaires: Number(transitairesCount),
      utilisateurs: Number(usersCount),
      admins: Number(adminsCount),
      vendeurs: Number(vendeursCount),
      vendeursActifs: Number(vendeursActifs),
      vendeursInactifs: Number(vendeursInactifs),
      adminsActifs: Number(adminsActifs),
      adminsInactifs: Number(adminsInactifs),
      annee: Number(anneeActivite)
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des statistiques', error });
  }
};

exports.getAcheteursStats = async (_req, res) => {
  try {
    const acheteurs = await User.countDocuments({ role: "acheteur" });
    const acheteursActifs = await User.countDocuments({ role: "acheteur", statut: "actif" });
    const acheteursInactifs = await User.countDocuments({ role: "acheteur", statut: "inactif" });
    // Achats en cours = articles avec un acheteur, non vendus, ou dateLivraison null
    const achatsEnCours = await Article.countDocuments({ acheteur: { $ne: null }, statutVente: { $ne: "vendu" } });
    // Achats livrés = articles avec un acheteur, statutVente vendu, et dateLivraison non null
    const achatsLIVRES = await Article.countDocuments({ acheteur: { $ne: null }, statutVente: "vendu", dateLivraison: { $ne: null } });
    res.json({
      acheteurs: Number(acheteurs),
      acheteursActifs: Number(acheteursActifs),
      acheteursInactifs: Number(acheteursInactifs),
      achatsEnCours: Number(achatsEnCours),
      achatsLIVRES: Number(achatsLIVRES)
    });
  } catch (err) {
    res.status(500).json({ message: "Erreur stats acheteurs" });
  }
};

/** Résumé vendeur pour l’onglet Statistiques (Tranoo Pro / marque). */
exports.getSellerMarqueStats = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== 'vendeur') {
      return res.status(403).json({ message: 'Réservé aux vendeurs' });
    }
    const uid = user._id;
    const userKeys = [uid, String(uid)];

    const venteAgg = await Payment.aggregate([
      {
        $match: {
          user: { $in: userKeys },
          type: 'vente',
          status: 'success',
        },
      },
      {
        $group: {
          _id: null,
          totalRevenueFcfa: { $sum: '$amount' },
          venteCount: { $sum: 1 },
        },
      },
    ]);
    const totalRevenueFcfa = Math.round(venteAgg[0]?.totalRevenueFcfa || 0);
    const venteSuccessCount = venteAgg[0]?.venteCount || 0;

    const baseListed = {
      vendeur: uid,
      statut: 'en_ligne',
      statutVente: { $ne: 'vendu' },
    };
    const vehiclesOnline = await Article.countDocuments({ ...baseListed, type: 'voiture' });
    const piecesOnline = await Article.countDocuments({ ...baseListed, type: 'piece' });
    const vehiclesSold = await Article.countDocuments({
      vendeur: uid,
      type: 'voiture',
      statutVente: 'vendu',
    });
    const piecesSold = await Article.countDocuments({
      vendeur: uid,
      type: 'piece',
      statutVente: 'vendu',
    });

    const u = await User.findById(uid).select('vendeurType').lean();
    const vendeurType = (u?.vendeurType || 'mixte').toString();

    return res.json({
      vendeurType,
      totalRevenueFcfa,
      venteSuccessCount,
      vehiclesOnline,
      piecesOnline,
      vehiclesSold,
      piecesSold,
    });
  } catch (error) {
    console.error('[getSellerMarqueStats]', error);
    return res.status(500).json({ message: 'Erreur stats vendeur', error: error.message });
  }
};

/** Revenus / comptabilité dashboard admin (graphiques + tableau). */
exports.getDashboardFinance = async (req, res) => {
  try {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = req.query.month != null ? Number(req.query.month) : now.getMonth() + 1;
    const safeMonth = month >= 1 && month <= 12 ? month : now.getMonth() + 1;

    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);
    const monthStart = new Date(`${year}-${String(safeMonth).padStart(2, '0')}-01T00:00:00.000Z`);
    const monthEnd = new Date(year, safeMonth, 0, 23, 59, 59, 999);

    const chartStart = new Date(now);
    chartStart.setMonth(chartStart.getMonth() - 11);
    chartStart.setDate(1);
    chartStart.setHours(0, 0, 0, 0);

    const paymentsForCharts = await Payment.find({
      createdAt: { $gte: chartStart, $lte: now },
      status: 'success',
    })
      .select('amount type createdAt achat method description')
      .populate({ path: 'achat', populate: { path: 'article', select: 'type' } })
      .lean();

    const monthlyMap = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(chartStart);
      d.setMonth(chartStart.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[key] = {
        month: MONTH_LABELS[d.getMonth()],
        monthKey: key,
        carSales: 0,
        partsSales: 0,
        subscriptions: 0,
        ads: 0,
      };
    }

    for (const p of paymentsForCharts) {
      const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[key]) continue;
      const amt = Number(p.amount) || 0;
      const articleType = p.achat?.article?.type || null;
      const t = (p.type || '').toLowerCase();
      if (t === 'publicite') monthlyMap[key].ads += amt;
      else if (t === 'subscription') monthlyMap[key].subscriptions += amt;
      else if (t === 'vente' || t === 'achat') {
        if (articleType === 'piece') monthlyMap[key].partsSales += amt;
        else monthlyMap[key].carSales += amt;
      } else if (t === 'verification') {
        monthlyMap[key].carSales += amt;
      }
    }

    const monthlyRevenue = Object.values(monthlyMap).sort((a, b) =>
      a.monthKey.localeCompare(b.monthKey)
    );

    const monthPayments = paymentsForCharts.filter(
      (p) => p.createdAt >= monthStart && p.createdAt <= monthEnd
    );

    let voitures = 0;
    let pieces = 0;
    let ads = 0;
    let subscriptions = 0;
    let services = 0;
    for (const p of monthPayments) {
      const amt = Number(p.amount) || 0;
      const articleType = p.achat?.article?.type || null;
      const t = (p.type || '').toLowerCase();
      if (t === 'publicite') ads += amt;
      else if (t === 'subscription') subscriptions += amt;
      else if (t === 'verification') services += amt;
      else if (t === 'vente' || t === 'achat') {
        if (articleType === 'piece') pieces += amt;
        else voitures += amt;
      }
    }

    const agentWithdrawalsMonth = await AgentEarning.aggregate([
      {
        $match: {
          type: 'withdrawal',
          createdAt: { $gte: monthStart, $lte: monthEnd },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const agentWithdrawals = agentWithdrawalsMonth[0]?.total || 0;

    const activityComparison = [
      { name: 'Vente de voitures', value: Math.round(voitures) },
      { name: 'Vente de pièces', value: Math.round(pieces) },
      { name: 'Prestations de service', value: Math.round(services) },
      { name: 'Publicités', value: Math.round(ads) },
      { name: 'Abonnements', value: Math.round(subscriptions) },
    ];

    const recentPayments = await Payment.find({})
      .sort({ createdAt: -1 })
      .limit(80)
      .select('amount type status method description createdAt achat')
      .populate({ path: 'achat', populate: { path: 'article', select: 'type titre' } })
      .lean();

    const accountingRows = recentPayments.map((p, idx) => {
      const articleType = p.achat?.article?.type || null;
      const activityType = paymentActivityLabel(p, articleType);
      const isEntry = p.status === 'success';
      return {
        id: String(p._id || idx),
        date: p.createdAt,
        activityType,
        movementType: isEntry ? 'Entrée' : 'Sortie',
        amount: Number(p.amount) || 0,
        description:
          p.description ||
          p.achat?.article?.titre ||
          activityType,
        paymentMethod: paymentMethodLabel(p.method),
        status: paymentStatusLabel(p.status),
      };
    });

    const successYear = await Payment.aggregate([
      { $match: { status: 'success', createdAt: { $gte: yearStart, $lte: yearEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const withdrawalsYear = await AgentEarning.aggregate([
      { $match: { type: 'withdrawal', createdAt: { $gte: yearStart, $lte: yearEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const entries = accountingRows
      .filter((r) => r.movementType === 'Entrée' && r.status === 'Confirmé')
      .reduce((s, r) => s + r.amount, 0);
    const exits = accountingRows
      .filter((r) => r.movementType === 'Sortie' || r.status === 'Refusé')
      .reduce((s, r) => s + r.amount, 0);

    return res.json({
      filters: { year, month: safeMonth },
      monthlyRevenue,
      activityComparison,
      accountingRows,
      accountingTotals: {
        entries: Math.round(entries),
        exits: Math.round(exits),
        net: Math.round(entries - exits),
        yearRevenueSuccess: Math.round(successYear[0]?.total || 0),
        yearAgentWithdrawals: Math.round(withdrawalsYear[0]?.total || 0),
        monthAgentWithdrawals: Math.round(agentWithdrawals),
      },
    });
  } catch (error) {
    console.error('[getDashboardFinance]', error);
    return res.status(500).json({ message: 'Erreur stats finance dashboard', error: error.message });
  }
};
