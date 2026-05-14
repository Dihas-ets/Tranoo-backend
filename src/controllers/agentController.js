const Referral = require('../models/Referral');
const ReferralTariff = require('../models/ReferralTariff');
const User = require('../models/User');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const AgentEarning = require('../models/AgentEarning');
const crypto = require('crypto');
const AgentDailyLog = require('../models/AgentDailyLog');
const Payment = require('../models/Payment');
const Publicite = require('../models/Publicite');
const AuthEvent = require('../models/AuthEvent');
const DemoEvent = require('../models/DemoEvent');
const mongoose = require('mongoose');

const toDateKey = (value) => {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
};

const buildDayRange = (dateKey) => {
  const start = new Date(`${dateKey}T00:00:00.000Z`);
  const end = new Date(`${dateKey}T23:59:59.999Z`);
  return { start, end };
};

const getReferredSellerIds = async (agentId) => {
  const refs = await Referral.find({ referrerId: agentId }).select('referredId').lean();
  const ids = refs.map((r) => String(r.referredId));
  const sellers = await User.find({ _id: { $in: ids }, role: 'vendeur' }).select('_id vendeurType').lean();
  return sellers;
};

const sumPayments = async (match) => {
  const rows = await Payment.aggregate([
    { $match: match },
    { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
  ]);
  return {
    count: rows[0]?.count || 0,
    totalAmount: rows[0]?.totalAmount || 0,
  };
};

const COMMISSION_TYPES = ['commission_publicite', 'commission_subscription'];

/** Paiements filleuls : `user` en base peut être String ou ObjectId selon les enregistrements. */
const referredSellerUserMatch = (sellerIds, sellerObjectIds) => ({
  $or: [{ user: { $in: sellerIds } }, { user: { $in: sellerObjectIds } }],
});

const sumCampaignPayments = async ({ sellerIds, sellerObjectIds, start, end }) => {
  const rows = await Payment.aggregate([
    {
      $match: {
        $and: [
          referredSellerUserMatch(sellerIds, sellerObjectIds),
          {
            status: 'success',
            createdAt: { $gte: start, $lte: end },
            $or: [{ type: 'publicite' }, { publicite: { $exists: true, $ne: null } }],
          },
        ],
      },
    },
    { $group: { _id: null, count: { $sum: 1 }, totalAmount: { $sum: '$amount' } } },
  ]);
  return {
    count: rows[0]?.count || 0,
    totalAmount: rows[0]?.totalAmount || 0,
  };
};

const DEMO_COOLDOWN_MINUTES = Number(process.env.DEMO_COOLDOWN_MINUTES || 15);

/**
 * Compte les "démos validées" sur une période.
 * Règle (5 actions commerciales équivalentes, pas d'événement de départ obligatoire):
 * - seller_create_started, campaign_initiated, subscription_initiated,
 *   notification_clicked, alert_created
 * - Au plus **1 démo comptée toutes les DEMO_COOLDOWN_MINUTES** (fenêtre glissante entre deux comptages).
 *   Les actions intermédiaires dans l'intervalle ne comptent pas une démo supplémentaire.
 * - seller_create_completed / listing_* ne comptent pas dans ce KPI
 */
const computeValidatedDemosForRange = async ({ agentId, sellerObjectIds, start, end }) => {
  const commercialEventTypes = [
    'seller_create_started',
    'campaign_initiated',
    'subscription_initiated',
    'notification_clicked',
    'alert_created',
  ];

  const rows = await DemoEvent.find({
    createdAt: { $gte: start, $lte: end },
    eventType: { $in: commercialEventTypes },
    $or: [
      { agent: agentId },
      { user: { $in: sellerObjectIds } }, // fallback si agent non renseigné dans l'event
    ],
  })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .lean();

  const times = rows.map((r) => new Date(r.createdAt).getTime());
  const cooldownMs = DEMO_COOLDOWN_MINUTES * 60 * 1000;

  let demosCount = 0;
  let lastCountedAt = null;
  for (const t of times) {
    if (lastCountedAt != null && t - lastCountedAt < cooldownMs) {
      continue;
    }
    demosCount += 1;
    lastCountedAt = t;
  }

  return demosCount;
};

const computeKpisForRange = async ({ agentId, start, end }) => {
  const sellers = await getReferredSellerIds(agentId);
  const sellerIds = sellers.map((s) => String(s._id));
  const piecesSellerIds = sellers
    .filter((s) => s.vendeurType === 'pieces' || s.vendeurType === 'mixte')
    .map((s) => String(s._id));

  const boutiquesCreees = await User.countDocuments({
    _id: { $in: sellerIds },
    role: 'vendeur',
    dateInscription: { $gte: start, $lte: end },
  });

  const sellerObjectIds = sellerIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const demonstrations = await computeValidatedDemosForRange({
    agentId,
    sellerObjectIds,
    start,
    end,
  });

  const subscriptionPayments = await sumPayments({
    user: { $in: piecesSellerIds },
    type: 'subscription',
    status: 'success',
    createdAt: { $gte: start, $lte: end },
  });
  const abonnementsVendus = subscriptionPayments.count;

  // Campagnes « finalisées » = paiements pub réussis des filleuls (aligné montants / commissions).
  const campaignPaymentsV1 = await sumCampaignPayments({ sellerIds, sellerObjectIds, start, end });
  const campagnesLancees = campaignPaymentsV1.count;
  const campagnesDemandees = await Publicite.countDocuments({
    vendeur: { $in: sellerIds },
    typePub: { $in: ['Sponsorisée', 'À la une'] },
    dateDemande: { $gte: start, $lte: end },
  });

  const commissionSubAgg = await AgentEarning.aggregate([
    { $match: { agent: agentId, type: 'commission_subscription', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const revenueAbonnement = commissionSubAgg[0]?.total || 0;

  const commissionPubAgg = await AgentEarning.aggregate([
    { $match: { agent: agentId, type: 'commission_publicite', createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const revenueCampagne = commissionPubAgg[0]?.total || 0;

  const objectifs = {
    prospects: { target: 20 },
    abonnements: { minimumBeforeWithdrawal: 4 },
    campagnes: { minimumBeforeWithdrawal: 4 },
  };

  return {
    demonstrations,
    boutiquesCreees,
    abonnementsVendus,
    campagnesLancees,
    campagnesDemandees,
    revenueAbonnement,
    revenueCampagne,
    objectifs,
    totalGenerer: revenueAbonnement + revenueCampagne,
  };
};

const computeKpisForRangeV2 = async ({ agentId, start, end }) => {
  const agentOid = mongoose.Types.ObjectId.isValid(String(agentId))
    ? new mongoose.Types.ObjectId(String(agentId))
    : agentId;

  const sellers = await getReferredSellerIds(agentId);
  const sellerIds = sellers.map((s) => String(s._id));

  const boutiquesCreees = await User.countDocuments({
    _id: { $in: sellerIds },
    role: 'vendeur',
    dateInscription: { $gte: start, $lte: end },
  });

  const sellerObjectIds = sellerIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const demonstrations = await computeValidatedDemosForRange({
    agentId: agentOid,
    sellerObjectIds,
    start,
    end,
  });

  // Abonnements : tous les vendeurs filleuls (pas seulement pièces) — aligné avec les paiements réels.
  const subscriptionPayments = await sumPayments({
    $and: [
      referredSellerUserMatch(sellerIds, sellerObjectIds),
      { type: 'subscription', status: 'success', createdAt: { $gte: start, $lte: end } },
    ],
  });

  const campaignPayments = await sumCampaignPayments({ sellerIds, sellerObjectIds, start, end });

  /** Demandes de pub créées sur la période (peuvent être non payées) — distinct des campagnes payées. */
  const campagnesDemandees = await Publicite.countDocuments({
    vendeur: { $in: sellerIds },
    typePub: { $in: ['Sponsorisée', 'À la une'] },
    dateDemande: { $gte: start, $lte: end },
  });

  const referredSuccessByType = await Payment.aggregate([
    {
      $match: {
        $and: [
          referredSellerUserMatch(sellerIds, sellerObjectIds),
          { status: 'success', createdAt: { $gte: start, $lte: end } },
        ],
      },
    },
    {
      $group: {
        _id: { type: '$type', userBson: { $type: '$user' } },
        count: { $sum: 1 },
        sumAmount: { $sum: '$amount' },
      },
    },
  ]);

  const lifetimeCommissionByType = await AgentEarning.aggregate([
    {
      $match: {
        agent: agentOid,
        type: { $in: ['commission_subscription', 'commission_publicite'] },
      },
    },
    { $group: { _id: '$type', total: { $sum: '$amount' } } },
  ]);

  // Campagnes « lancées » au sens métier = paiements pub réussis sur la période (même base que campaignAmount / commissions).
  const campagnesLancees = campaignPayments.count;

  // Revenus = commissions déjà créditées (10 % enregistrés dans AgentEarning), pas un second calcul sur Payment.
  const commissionSubAgg = await AgentEarning.aggregate([
    {
      $match: {
        agent: agentOid,
        type: 'commission_subscription',
        createdAt: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const revenueAbonnement = Math.round(commissionSubAgg[0]?.total || 0);

  const commissionPubAgg = await AgentEarning.aggregate([
    {
      $match: {
        agent: agentOid,
        type: 'commission_publicite',
        createdAt: { $gte: start, $lte: end },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const revenueCampagne = Math.round(commissionPubAgg[0]?.total || 0);

  const earningByTypeInRange = await AgentEarning.aggregate([
    { $match: { agent: agentOid, createdAt: { $gte: start, $lte: end } } },
    { $group: { _id: '$type', count: { $sum: 1 }, sumAmount: { $sum: '$amount' } } },
  ]);
  const latestEarnings = await AgentEarning.find({ agent: agentOid })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('type amount createdAt sourcePayment referredUser')
    .lean();

  const objectifs = {
    prospects: { target: 20 },
    abonnements: { minimumBeforeWithdrawal: 4 },
    campagnes: { minimumBeforeWithdrawal: 4 },
  };

  console.log(
    '[AGENT_KPI_V2]',
    JSON.stringify({
      agentIdRaw: String(agentId),
      agentOidUsed: String(agentOid),
      range: {
        start: start?.toISOString?.() || String(start),
        end: end?.toISOString?.() || String(end),
      },
      referredSellersCount: sellerIds.length,
      referredSellersSample: sellerIds.slice(0, 5),
      demonstrations,
      abonnementsVendus: subscriptionPayments.count,
      campagnesLancees,
      campagnesDemandees,
      subscriptionAmount: subscriptionPayments.totalAmount || 0,
      campaignAmount: campaignPayments.totalAmount || 0,
      kpiNote:
        'abonnementsVendus = nb Payment subscription success (filleuls vendeurs, user string|ObjectId). campagnesLancees = nb Payment pub success même base que campaignAmount. campagnesDemandees = demandes Publicite (dateDemande). revenue* = somme AgentEarning commissions sur la période UTC jour (≠ montant brut payé).',
      revenueAbonnement,
      revenueCampagne,
      earningByTypeInRange,
      referredSuccessByType,
      lifetimeCommissionByType,
      latestEarningsPreview: latestEarnings.map((e) => ({
        type: e.type,
        amount: e.amount,
        createdAt: e.createdAt,
        hasSourcePayment: Boolean(e.sourcePayment),
      })),
    })
  );

  return {
    demonstrations,
    boutiquesCreees,
    abonnementsVendus: subscriptionPayments.count,
    campagnesLancees,
    campagnesDemandees,
    revenueAbonnement,
    revenueCampagne,
    objectifs,
    totalGenerer: revenueAbonnement + revenueCampagne,
  };
};

const buildAgentActivitySummary = async ({ agent, start, end }) => {
  const kpis = await computeKpisForRangeV2({ agentId: agent._id, start, end });
  const dailyActivity = await AgentDailyLog.findOne({
    agent: agent._id,
    dateKey: {
      $gte: start.toISOString().slice(0, 10),
      $lte: end.toISOString().slice(0, 10),
    },
    $or: [
      { prospectsApproached: { $gt: 0 } },
      { zoneText: { $nin: [null, ''] } },
      { 'zoneLocation.lat': { $ne: null } },
    ],
  })
    .sort({ updatedAt: -1 })
    .select('dateKey updatedAt')
    .lean();

  const referralCount = await Referral.countDocuments({
    referrerId: agent._id,
    createdAt: { $gte: start, $lte: end },
  });

  const score =
    (dailyActivity ? 1 : 0) +
    referralCount +
    (kpis.boutiquesCreees || 0) +
    (kpis.demonstrations || 0) +
    (kpis.abonnementsVendus || 0) +
    (kpis.campagnesLancees || 0);

  const reasons = [];
  if (dailyActivity) reasons.push('journal');
  if (referralCount > 0) reasons.push('filleuls');
  if (kpis.boutiquesCreees > 0) reasons.push('boutiques');
  if (kpis.demonstrations > 0) reasons.push('demos');
  if (kpis.abonnementsVendus > 0) reasons.push('abonnements');
  if (kpis.campagnesLancees > 0) reasons.push('campagnes');

  return {
    agentId: String(agent._id),
    status: score > 0 ? 'actif' : 'inactif',
    score,
    reasons,
    kpis,
    lastDailyLogAt: dailyActivity?.updatedAt || null,
  };
};

const assertAgentType = (user, expectedType) => {
  if (user.role !== 'agentCommercial') {
    return { ok: false, status: 403, message: 'Accès réservé aux agents commerciaux' };
  }
  if ((user.typeAgent || 'Tranoo') !== expectedType) {
    return { ok: false, status: 403, message: `Accès réservé aux agents ${expectedType}` };
  }
  return { ok: true };
};

exports.getMyDashboard = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== 'agentCommercial') {
      return res.status(403).json({ message: 'Accès réservé aux agents commerciaux' });
    }

    const referrerId = user._id;
    const dateKey = toDateKey(req.query.date);
    const { start, end } = buildDayRange(dateKey);

    const totalReferrals = await Referral.countDocuments({ referrerId });
    const completed = await Referral.find({ referrerId, status: 'completed' }).select('rewardAmount');
    const completedCount = completed.length;

    // Somme des gains enregistrés (sans compter les retraits)
    const earnings = await AgentEarning.aggregate([
      { $match: { agent: user._id, type: { $in: COMMISSION_TYPES } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEarnings = (earnings[0]?.total || 0);

    // Somme des retraits
    const withdrawalsAgg = await AgentEarning.aggregate([
      { $match: { agent: user._id, type: 'withdrawal' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalWithdrawn = withdrawalsAgg[0]?.total || 0;
    const currentBalance = totalEarnings - totalWithdrawn;

    const tariffs = await ReferralTariff.find({}).sort({ createdAt: -1 });
    const daily = await AgentDailyLog.findOne({ agent: user._id, dateKey }).lean();
    const kpis = await computeKpisForRangeV2({ agentId: user._id, start, end });
    const history = await AgentDailyLog.find({ agent: user._id })
      .sort({ dateKey: -1 })
      .limit(60)
      .select('dateKey zoneText prospectsApproached adminObservation updatedAt')
      .lean();

    res.json({
      agent: {
        id: user._id,
        uid: user.uid,
        nom: user.nom,
        prenoms: user.prenoms,
        email: user.email,
        photo: user.photo || null,
        role: user.role,
        typeAgent: user.typeAgent || 'Tranoo',
        assignedReferralTariff: user.assignedReferralTariff || null,
        referralCode: user.referralCode || null,
        mobileCredentials:
          (user.typeAgent || 'Tranoo') === 'Tranoo_pro'
            ? (user.mobileCredentials || { login: null, password: null })
            : null,
        tranooBuyerCredentials:
          (user.typeAgent || 'Tranoo') === 'Tranoo_pro'
            ? (user.tranooBuyerCredentials || { login: null, password: null })
            : null,
      },
      stats: {
        totalReferrals,
        completedReferrals: completedCount,
        pendingReferrals: totalReferrals - completedCount,
        totalEarnings,
        totalWithdrawn,
        currentBalance,
      },
      daily: {
        dateKey,
        zoneText: daily?.zoneText || '',
        zoneLocation: daily?.zoneLocation || null,
        prospectsApproached: daily?.prospectsApproached || 0,
        adminObservation: daily?.adminObservation || '',
        ...kpis,
      },
      history,
      tariffs,
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur chargement tableau de bord agent', error: err.message });
  }
};

exports.getMyDashboardPro = async (req, res) => {
  try {
    const user = req.user;
    const check = assertAgentType(user, 'Tranoo_pro');
    if (!check.ok) return res.status(check.status).json({ message: check.message });
    return exports.getMyDashboard(req, res);
  } catch (err) {
    return res.status(500).json({ message: 'Erreur chargement tableau de bord agent pro', error: err.message });
  }
};

exports.getMyDashboardTranoo = async (req, res) => {
  try {
    const user = req.user;
    const check = assertAgentType(user, 'Tranoo');
    if (!check.ok) return res.status(check.status).json({ message: check.message });
    return exports.getMyDashboard(req, res);
  } catch (err) {
    return res.status(500).json({ message: 'Erreur chargement tableau de bord agent', error: err.message });
  }
};

exports.upsertMyDailyLog = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== 'agentCommercial') {
      return res.status(403).json({ message: 'Accès réservé aux agents commerciaux' });
    }

    const dateKey = toDateKey(req.body?.date || req.query?.date);
    const updates = {};

    if (typeof req.body?.zoneText === 'string') {
      updates.zoneText = req.body.zoneText.trim();
    }
    if (req.body?.zoneLocation && typeof req.body.zoneLocation === 'object') {
      const { lat, lng, label } = req.body.zoneLocation;
      updates.zoneLocation = {
        lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
        lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
        label: typeof label === 'string' ? label.trim() : '',
        capturedAt: new Date(),
      };
    }
    if (Number.isFinite(Number(req.body?.prospectsApproached))) {
      updates.prospectsApproached = Math.max(0, Number(req.body.prospectsApproached));
    }

    const doc = await AgentDailyLog.findOneAndUpdate(
      { agent: user._id, dateKey },
      { $set: updates },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ message: 'Données journalières sauvegardées', daily: doc });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur sauvegarde journalière', error: err.message });
  }
};

exports.upsertMyDailyLogPro = async (req, res) => {
  const check = assertAgentType(req.user, 'Tranoo_pro');
  if (!check.ok) return res.status(check.status).json({ message: check.message });
  return exports.upsertMyDailyLog(req, res);
};

exports.upsertMyDailyLogTranoo = async (req, res) => {
  const check = assertAgentType(req.user, 'Tranoo');
  if (!check.ok) return res.status(check.status).json({ message: check.message });
  return exports.upsertMyDailyLog(req, res);
};

exports.incrementMyProspects = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== 'agentCommercial') {
      return res.status(403).json({ message: 'Accès réservé aux agents commerciaux' });
    }

    const dateKey = toDateKey(req.body?.date || req.query?.date);
    const step = Number.isFinite(Number(req.body?.step)) ? Number(req.body.step) : 1;
    const safeStep = Math.max(1, Math.floor(step));

    const doc = await AgentDailyLog.findOneAndUpdate(
      { agent: user._id, dateKey },
      { $inc: { prospectsApproached: safeStep } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({
      message: 'Prospects approchés mis à jour',
      prospectsApproached: doc.prospectsApproached || 0,
      daily: doc,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur mise à jour prospects', error: err.message });
  }
};

exports.incrementMyProspectsPro = async (req, res) => {
  const check = assertAgentType(req.user, 'Tranoo_pro');
  if (!check.ok) return res.status(check.status).json({ message: check.message });
  return exports.incrementMyProspects(req, res);
};

exports.incrementMyProspectsTranoo = async (req, res) => {
  const check = assertAgentType(req.user, 'Tranoo');
  if (!check.ok) return res.status(check.status).json({ message: check.message });
  return exports.incrementMyProspects(req, res);
};

exports.updateDailyObservationByAdmin = async (req, res) => {
  try {
    const adminUser = req.user;
    const { id } = req.params;
    const dateKey = toDateKey(req.body?.date || req.query?.date);
    const observation = typeof req.body?.observation === 'string' ? req.body.observation.trim() : '';

    const agent = await User.findById(id).lean();
    if (!agent || agent.role !== 'agentCommercial') {
      return res.status(404).json({ message: 'Agent commercial non trouvé' });
    }

    const doc = await AgentDailyLog.findOneAndUpdate(
      { agent: id, dateKey },
      {
        $set: {
          adminObservation: observation,
          adminObservationUpdatedBy: adminUser._id,
          adminObservationUpdatedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.json({ message: 'Observation enregistrée', daily: doc });
  } catch (err) {
    return res.status(500).json({ message: "Erreur enregistrement observation", error: err.message });
  }
};

// Dashboard d'un agent vu par l'admin (stats + timeline + solde)
exports.getAgentReferralStatsForAdmin = async (req, res) => {
  try {
    const agentId = req.params.id;
    const agent = await User.findById(agentId).lean();
    if (!agent || agent.role !== 'agentCommercial') {
      return res.status(404).json({ message: 'Agent commercial non trouvé' });
    }

    const referrerId = agent._id;

    const totalReferrals = await Referral.countDocuments({ referrerId });
    const completed = await Referral.find({ referrerId, status: 'completed' }).select('rewardAmount');
    const completedCount = completed.length;
    const pendingCount = totalReferrals - completedCount;

    // Somme de tous les gains (hors retraits)
    const earningsAgg = await AgentEarning.aggregate([
      { $match: { agent: referrerId, type: { $in: COMMISSION_TYPES } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEarnings = earningsAgg[0]?.total || 0;

    // Somme des retraits (type 'withdrawal')
    const withdrawalsAgg = await AgentEarning.aggregate([
      { $match: { agent: referrerId, type: 'withdrawal' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalWithdrawn = withdrawalsAgg[0]?.total || 0;
    const currentBalance = totalEarnings - totalWithdrawn;

    // Timeline mensuelle basée sur Referral.createdAt
    const monthly = await Referral.aggregate([
      { $match: { referrerId } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const monthlyTimeline = monthly.map((item) => ({
      month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      count: item.count,
    }));

    return res.json({
      totalReferrals,
      completedReferrals: completedCount,
      pendingReferrals: pendingCount,
      totalEarnings,
      totalWithdrawn,
      currentBalance,
      monthlyTimeline,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur chargement stats agent', error: err.message });
  }
};

// Liste des parrainages d'un agent vue par l'admin
exports.getAgentReferralsForAdmin = async (req, res) => {
  try {
    const agentId = req.params.id;
    const agent = await User.findById(agentId).lean();
    if (!agent || agent.role !== 'agentCommercial') {
      return res.status(404).json({ message: 'Agent commercial non trouvé' });
    }

    const referrals = await Referral.find({ referrerId: agent._id })
      .populate('referredId', 'nom prenoms email')
      .sort({ createdAt: -1 })
      .lean();

    return res.json(referrals);
  } catch (err) {
    return res.status(500).json({ message: 'Erreur chargement parrainages agent', error: err.message });
  }
};

// Enregistrement d'un retrait manuel par l'admin
exports.registerAgentWithdrawal = async (req, res) => {
  try {
    const agentId = req.params.id;
    const { amount } = req.body;
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ message: 'Montant invalide' });
    }

    const agent = await User.findById(agentId);
    if (!agent || agent.role !== 'agentCommercial') {
      return res.status(404).json({ message: 'Agent commercial non trouvé' });
    }

    // Calculer le solde actuel (gains - retraits déjà enregistrés)
    const earningsAgg = await AgentEarning.aggregate([
      { $match: { agent: agent._id, type: { $in: COMMISSION_TYPES } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEarnings = earningsAgg[0]?.total || 0;
    const withdrawalsAgg = await AgentEarning.aggregate([
      { $match: { agent: agent._id, type: 'withdrawal' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalWithdrawn = withdrawalsAgg[0]?.total || 0;
    const currentBalance = totalEarnings - totalWithdrawn;

    if (numericAmount > currentBalance) {
      return res.status(400).json({ message: 'Montant supérieur au solde disponible' });
    }

    await AgentEarning.create({
      agent: agent._id,
      type: 'withdrawal',
      amount: numericAmount,
      sourcePayment: null,
      referredUser: null,
    });

    return res.status(201).json({ message: 'Retrait enregistré', newBalance: currentBalance - numericAmount });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur enregistrement retrait', error: err.message });
  }
};

// Historique global des retraits (admin)
exports.getAllWithdrawalsForAdmin = async (req, res) => {
  try {
    const { agentId } = req.query;
    const match = { type: 'withdrawal' };
    if (agentId) {
      match.agent = agentId;
    }

    const rows = await AgentEarning.find(match)
      .populate('agent', 'nom prenoms email')
      .sort({ createdAt: -1 })
      .lean();

    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ message: 'Erreur chargement historiques retraits', error: err.message });
  }
};

// Création d'un agent commercial par un administrateur
exports.createAgent = async (req, res) => {
  try {
    const adminUser = req.user;
    if (adminUser.role !== 'admin') {
      return res.status(403).json({ message: 'Accès refusé. Admin requis.' });
    }

    const { nom, prenoms, email, telephone, password, assignedReferralTariff } = req.body;
    if (!email || !password || !nom || !prenoms) {
      return res.status(400).json({ message: 'Champs requis: nom, prenoms, email, password' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Un utilisateur avec cet email existe déjà' });

    const fbUser = await admin.auth().createUser({
      email,
      password,
      displayName: `${prenoms} ${nom}`,
    });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      uid: fbUser.uid,
      nom,
      prenoms,
      email,
      telephone,
      role: 'agentCommercial',
      password: hashed,
      assignedReferralTariff: assignedReferralTariff || null,
      statut: 'actif',
      dateInscription: new Date(),
    });

    // Générer un code de parrainage unique
    const generateReferralCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();
    let code = generateReferralCode();
    while (await User.findOne({ referralCode: code })) {
      code = generateReferralCode();
    }
    user.referralCode = code;
    await user.save();

    return res.status(201).json({ message: 'Agent commercial créé avec succès', user });
  } catch (err) {
    return res.status(500).json({ message: "Erreur lors de la création de l'agent commercial", error: err.message });
  }
};

// Leaderboard dynamique des agents (par nombre de parrainages validés)
exports.getLeaderboard = async (req, res) => {
  try {
    const me = req.user;
    // Agrégation des parrainages complétés par agent
    const rows = await Referral.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$referrerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.role': 'agentCommercial' } },
      { $project: { agentId: '$user._id', nom: '$user.nom', prenoms: '$user.prenoms', count: 1 } }
    ]);

    // Trouver la position de l'agent courant
    const sorted = rows; // déjà trié desc
    const myRow = sorted.find(r => String(r.agentId) === String(me._id));
    const myCount = myRow ? myRow.count : 0;
    const myRank = myRow ? (sorted.findIndex(r => String(r.agentId) === String(me._id)) + 1) : (sorted.length + 1);

    // Construire top 5 anonymisé (sauf "Vous")
    const top = sorted.slice(0, 5).map(r => {
      const isSelf = String(r.agentId) === String(me._id);
      const anonym = `Agent #${String(r.agentId).slice(-4).toUpperCase()}`;
      return {
        name: isSelf ? 'Vous' : anonym,
        count: r.count,
        self: isSelf
      };
    });

    return res.json({ top, myRank, myCount });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur leaderboard', error: err.message });
  }
};

exports.getLeaderboardPro = async (req, res) => {
  const check = assertAgentType(req.user, 'Tranoo_pro');
  if (!check.ok) return res.status(check.status).json({ message: check.message });
  return exports.getLeaderboard(req, res);
};

exports.getLeaderboardTranoo = async (req, res) => {
  const check = assertAgentType(req.user, 'Tranoo');
  if (!check.ok) return res.status(check.status).json({ message: check.message });
  return exports.getLeaderboard(req, res);
};

exports.getConsolidatedAdminStats = async (req, res) => {
  try {
    const { from, to, typeAgent = 'all' } = req.query;
    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date('1970-01-01T00:00:00.000Z');
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
    const agentFilter = { role: 'agentCommercial' };
    if (typeAgent !== 'all') agentFilter.typeAgent = typeAgent;

    const agents = await User.find(agentFilter).select('_id nom prenoms typeAgent').lean();
    const agentIds = agents.map((a) => a._id);

    const earningsAgg = await AgentEarning.aggregate([
      { $match: { agent: { $in: agentIds }, type: { $in: ['commission_publicite', 'commission_subscription'] }, createdAt: { $gte: fromDate, $lte: toDate } } },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]);
    const totalRevenueSubscription = earningsAgg.find((e) => e._id === 'commission_subscription')?.total || 0;
    const totalRevenueCampagne = earningsAgg.find((e) => e._id === 'commission_publicite')?.total || 0;

    const withdrawalsAgg = await AgentEarning.aggregate([
      { $match: { agent: { $in: agentIds }, type: 'withdrawal', createdAt: { $gte: fromDate, $lte: toDate } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalWithdrawn = withdrawalsAgg[0]?.total || 0;

    const totalByAgent = await AgentEarning.aggregate([
      { $match: { agent: { $in: agentIds }, type: { $in: ['commission_publicite', 'commission_subscription'] }, createdAt: { $gte: fromDate, $lte: toDate } } },
      { $group: { _id: '$agent', total: { $sum: '$amount' } } },
      { $sort: { total: -1 } },
    ]);

    const activitySummaries = await Promise.all(
      agents.map((agent) => buildAgentActivitySummary({ agent, start: fromDate, end: toDate }))
    );
    const activityByAgent = activitySummaries.reduce((acc, item) => {
      acc[item.agentId] = item;
      return acc;
    }, {});
    const activeAgents = activitySummaries.filter((item) => item.status === 'actif').length;
    const inactiveAgents = activitySummaries.length - activeAgents;
    const kpiTotals = activitySummaries.reduce(
      (acc, item) => {
        acc.totalRevenueSubscription += item.kpis.revenueAbonnement || 0;
        acc.totalRevenueCampagne += item.kpis.revenueCampagne || 0;
        acc.abonnementsVendus += item.kpis.abonnementsVendus || 0;
        acc.campagnesLancees += item.kpis.campagnesLancees || 0;
        acc.campagnesDemandees += item.kpis.campagnesDemandees || 0;
        return acc;
      },
      {
        totalRevenueSubscription: 0,
        totalRevenueCampagne: 0,
        abonnementsVendus: 0,
        campagnesLancees: 0,
        campagnesDemandees: 0,
      }
    );
    const mapById = new Map(agents.map((a) => [String(a._id), a]));
    const topAgents = [...activitySummaries]
      .sort((a, b) => (b.kpis.totalGenerer || 0) - (a.kpis.totalGenerer || 0))
      .slice(0, 5)
      .map((row) => {
        const a = mapById.get(String(row.agentId));
        return {
          agentId: row.agentId,
          nom: a?.nom || '',
          prenoms: a?.prenoms || '',
          typeAgent: a?.typeAgent || 'Tranoo',
          totalGenerer: row.kpis.totalGenerer || 0,
        };
      });

    const fromKey = fromDate.toISOString().slice(0, 10);
    const toKey = toDate.toISOString().slice(0, 10);
    const dailyLogs = await AgentDailyLog.find({
      agent: { $in: agentIds },
      dateKey: { $gte: fromKey, $lte: toKey },
    })
      .select('agent dateKey zoneText prospectsApproached adminObservation updatedAt')
      .lean();

    const logByAgent = {};
    for (const l of dailyLogs) {
      const sid = String(l.agent);
      if (!logByAgent[sid]) {
        logByAgent[sid] = { prospectsSum: 0, last: null };
      }
      logByAgent[sid].prospectsSum += Number(l.prospectsApproached || 0);
      const lu = new Date(l.updatedAt || 0).getTime();
      const prev = logByAgent[sid].last;
      if (!prev || lu > new Date(prev.updatedAt || 0).getTime()) {
        logByAgent[sid].last = l;
      }
    }

    const tracking = agents.map((a) => {
      const id = String(a._id);
      const act = activityByAgent[id];
      const kpis = act?.kpis || {};
      const lg = logByAgent[id];
      const zoneText = lg?.last?.zoneText != null ? String(lg.last.zoneText).trim() : '';
      const adminObservation =
        lg?.last?.adminObservation != null ? String(lg.last.adminObservation).trim() : '';
      return {
        agentId: id,
        prenoms: a.prenoms || '',
        nom: a.nom || '',
        typeAgent: a.typeAgent || 'Tranoo',
        periodLabel: fromKey === toKey ? fromKey : `${fromKey} → ${toKey}`,
        refDateKey: lg?.last?.dateKey || null,
        zoneText: zoneText || '-',
        prospectsApproached: lg?.prospectsSum ?? 0,
        demonstrations: kpis.demonstrations ?? 0,
        boutiquesCreees: kpis.boutiquesCreees ?? 0,
        abonnementsVendus: kpis.abonnementsVendus ?? 0,
        campagnesLancees: kpis.campagnesLancees ?? 0,
        campagnesDemandees: kpis.campagnesDemandees ?? 0,
        totalGenerer: kpis.totalGenerer ?? 0,
        adminObservation: adminObservation || '-',
      };
    });

    return res.json({
      filters: { from: from || null, to: to || null, typeAgent },
      totals: {
        agents: agents.length,
        activeAgents,
        inactiveAgents,
        totalGenerer: kpiTotals.totalRevenueSubscription + kpiTotals.totalRevenueCampagne,
        totalRevenueSubscription: kpiTotals.totalRevenueSubscription,
        totalRevenueCampagne: kpiTotals.totalRevenueCampagne,
        abonnementsVendus: kpiTotals.abonnementsVendus,
        campagnesLancees: kpiTotals.campagnesLancees,
        campagnesDemandees: kpiTotals.campagnesDemandees,
        totalWithdrawn,
      },
      topAgents,
      activityByAgent,
      tracking,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur chargement consolidé admin', error: err.message });
  }
};

exports.getAgentProDailyMonitorForAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, from, to } = req.query;

    const agent = await User.findById(id).lean();
    if (!agent || agent.role !== 'agentCommercial') {
      return res.status(404).json({ message: 'Agent commercial non trouvé' });
    }
    if ((agent.typeAgent || 'Tranoo') !== 'Tranoo_pro') {
      return res.status(400).json({ message: 'Cette vue est réservée aux agents Tranoo_pro' });
    }

    const selectedDate = toDateKey(date);
    const { start: dayStart, end: dayEnd } = buildDayRange(selectedDate);
    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date(`${selectedDate}T00:00:00.000Z`);
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date(`${selectedDate}T23:59:59.999Z`);

    const dailyLog = await AgentDailyLog.findOne({ agent: id, dateKey: selectedDate }).lean();
    const kpis = await computeKpisForRangeV2({ agentId: agent._id, start: dayStart, end: dayEnd });

    const history = await AgentDailyLog.find({
      agent: id,
      dateKey: {
        $gte: fromDate.toISOString().slice(0, 10),
        $lte: toDate.toISOString().slice(0, 10),
      },
    })
      .sort({ dateKey: -1 })
      .limit(120)
      .select('dateKey zoneText prospectsApproached adminObservation updatedAt')
      .lean();

    const stats = await AgentEarning.aggregate([
      { $match: { agent: agent._id } },
      {
        $group: {
          _id: null,
          totalEarnings: {
            $sum: {
              $cond: [{ $in: ['$type', COMMISSION_TYPES] }, '$amount', 0],
            },
          },
          totalWithdrawn: {
            $sum: {
              $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0],
            },
          },
        },
      },
    ]);
    const totalEarnings = stats[0]?.totalEarnings || 0;
    const totalWithdrawn = stats[0]?.totalWithdrawn || 0;

    return res.status(200).json({
      agent: {
        _id: agent._id,
        nom: agent.nom,
        prenoms: agent.prenoms,
        email: agent.email,
        photo: agent.photo || null,
        typeAgent: agent.typeAgent || 'Tranoo',
        referralCode: agent.referralCode || null,
        mobileCredentials: agent.mobileCredentials || { login: null, password: null },
        tranooBuyerCredentials: agent.tranooBuyerCredentials || { login: null, password: null },
      },
      selectedDate,
      filters: {
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
      },
      daily: {
        dateKey: selectedDate,
        zoneText: dailyLog?.zoneText || '',
        prospectsApproached: dailyLog?.prospectsApproached || 0,
        adminObservation: dailyLog?.adminObservation || '',
        ...kpis,
      },
      history,
      balance: {
        totalEarnings,
        totalWithdrawn,
        currentBalance: totalEarnings - totalWithdrawn,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur chargement détails Tranoo_pro', error: err.message });
  }
};
