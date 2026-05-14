const Subscription = require('../models/Subscription');
const SubscriptionPricing = require('../models/SubscriptionPricing');
const User = require('../models/User');
const Article = require('../models/Article');

async function hasSellerPieceAccess(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return false;
  const trialEnd = await getSellerTrialEndDate(user);
  if (trialEnd && new Date() <= trialEnd) return true;
  const sub = await Subscription.findOne({ user: userId }).lean();
  const now = new Date();
  if (!sub || !sub.expiresAt) return false;
  const exp = new Date(sub.expiresAt);
  if (!(exp > now)) return false;
  const act = sub.activatedAt ? new Date(sub.activatedAt) : null;
  // Période payante valide si échéance future. `activatedAt` dans le futur = ancien bug
  // d’écriture au renouvellement ; on ne refuse pas l’accès tant que expiresAt > now.
  if (!act || Number.isNaN(act.getTime())) return true;
  return act <= now || (act > now && exp > now);
}

async function getSellerTrialEndDate(user) {
  const inscriptionDate = user?.dateInscription || user?.createdAt;
  if (!inscriptionDate) return null;
  const pricing =
    (await SubscriptionPricing.findOne({
      key: 'SUBSCRIPTION_PRICING_SINGLETON',
    }).lean()) || {};
  const freeTrialDays = Number(pricing.freeTrialDays ?? 45);
  const trialEnd = new Date(inscriptionDate);
  trialEnd.setDate(
    trialEnd.getDate() + (Number.isFinite(freeTrialDays) ? freeTrialDays : 45)
  );
  return trialEnd;
}

async function syncSellerPieceVisibility(userId, allowed) {
  if (allowed) {
    await Article.updateMany(
      { type: 'piece', vendeur: userId, subscriptionLocked: true },
      {
        $set: { subscriptionLocked: false, subscriptionLockedAt: null, statut: 'en_ligne' },
      },
    );
    return;
  }
  await Article.updateMany(
    {
      type: 'piece',
      vendeur: userId,
      subscriptionLocked: { $ne: true },
    },
    {
      $set: { subscriptionLocked: true, subscriptionLockedAt: new Date(), statut: 'en_attente' },
    },
  );
}

// GET /api/subscription/me
exports.getMySubscription = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });
    let sub = await Subscription.findOne({ user: userId }).lean();
    const pricing =
      (await SubscriptionPricing.findOne({
        key: 'SUBSCRIPTION_PRICING_SINGLETON',
      }).lean()) || { prixMensuel: 0, freeTrialDays: 45 };
    console.log(
      '[SUBSCRIPTION_ME] user=%s pricingDoc=%j',
      userId?.toString?.() || userId,
      pricing
    );
    const accessAllowed = await hasSellerPieceAccess(userId);
    await syncSellerPieceVisibility(userId, accessAllowed);

    if (!sub) {
      const resolvedMonthlyPrice = Number(pricing.prixMensuel ?? 0);
      console.log(
        '[SUBSCRIPTION_ME] no sub => resolvedMonthlyPrice=%s',
        resolvedMonthlyPrice
      );
      return res.json({ hasSubscription: false, monthlyPrice: resolvedMonthlyPrice });
    }
    const now = new Date();
    const exp = sub.expiresAt ? new Date(sub.expiresAt) : null;
    const act = sub.activatedAt ? new Date(sub.activatedAt) : null;
    const hasSubscription = Boolean(
      exp &&
        exp > now &&
        (!act ||
          Number.isNaN(act.getTime()) ||
          act <= now ||
          (act > now && exp > now))
    );
    const resolvedMonthlyPrice = Number(pricing.prixMensuel ?? 0);
    console.log(
      '[SUBSCRIPTION_ME] activeOrExpired=%s resolvedMonthlyPrice=%s months=%s expiresAt=%s',
      hasSubscription,
      resolvedMonthlyPrice,
      sub.months || 1,
      sub.expiresAt
    );
    return res.json({
      hasSubscription,
      activatedAt: sub.activatedAt,
      expiresAt: sub.expiresAt,
      plan: sub.plan,
      months: sub.months || 1,
      monthlyPrice: resolvedMonthlyPrice,
      status: hasSubscription ? 'active' : 'expired',
    });
  } catch (e) {
    return res.status(500).json({ message: 'Erreur récupération abonnement', error: e?.message });
  }
};

// POST /api/subscription/subscribe { plan?: 'monthly', months?: number }
exports.subscribe = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });
    const plan = (req.body?.plan || 'monthly').toLowerCase();
    const months = Math.max(1, Math.min(Number(req.body?.months || 1), 24));
    const now = new Date();
    const user = await User.findById(userId).lean();
    const trialEnd = await getSellerTrialEndDate(user);
    // monthly => +30 jours par mois acheté

    const existing = await Subscription.findOne({ user: userId });
    if (existing) {
      // prolonge si encore actif, sinon redémarre
      const base =
        existing.expiresAt && existing.expiresAt > now
          ? existing.expiresAt
          : trialEnd && trialEnd > now
            ? trialEnd
            : now;
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + 30 * months);
      existing.plan = plan;
      existing.months = months;
      // `activatedAt` ne doit jamais être dans le futur : sinon GET /subscription/me
      // considère l'abonnement inactif (activatedAt <= now requis).
      const prevAct = existing.activatedAt ? new Date(existing.activatedAt) : null;
      if (!prevAct || Number.isNaN(prevAct.getTime()) || prevAct > now) {
        existing.activatedAt = now;
      }
      existing.expiresAt = newExpiry;
      existing.status = 'active';
      await existing.save();
      await syncSellerPieceVisibility(userId, true);
      return res.json({
        message: 'Abonnement prolongé',
        activatedAt: existing.activatedAt,
        expiresAt: existing.expiresAt,
        plan: existing.plan,
        months: existing.months,
        status: existing.status,
      });
    }

    const activatedAt = trialEnd && trialEnd > now ? trialEnd : now;
    const expiresAt = new Date(activatedAt);
    expiresAt.setDate(expiresAt.getDate() + 30 * months);

    const sub = await Subscription.create({
      user: userId,
      plan,
      months,
      activatedAt,
      expiresAt,
      status: 'active',
    });
    return res.status(201).json({
      message: 'Abonnement activé',
      activatedAt: sub.activatedAt,
      expiresAt: sub.expiresAt,
      plan: sub.plan,
      months: sub.months,
      status: sub.status,
    });
  } catch (e) {
    return res.status(500).json({ message: 'Erreur activation abonnement', error: e?.message });
  }
};

// GET /api/subscription/status/:userId - Vérifier le statut d'abonnement d'un utilisateur
exports.getUserSubscriptionStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ message: 'ID utilisateur requis' });
    
    const sub = await Subscription.findOne({ user: userId }).lean();
    if (!sub) {
      return res.json({ 
        hasSubscription: false, 
        status: 'inactive' 
      });
    }
    
    const now = new Date();
    const hasSubscription = sub.expiresAt && new Date(sub.expiresAt) > now;
    
    const accessAllowed = await hasSellerPieceAccess(userId);
    await syncSellerPieceVisibility(userId, accessAllowed);

    return res.json({
      hasSubscription,
      status: hasSubscription ? 'active' : 'expired',
      expiresAt: sub.expiresAt,
      activatedAt: sub.activatedAt,
      months: sub.months || 1,
    });
  } catch (e) {
    return res.status(500).json({ message: 'Erreur vérification statut', error: e?.message });
  }
};
