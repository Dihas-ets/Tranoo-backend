const Subscription = require('../models/Subscription');
const SubscriptionPricing = require('../models/SubscriptionPricing');
const User = require('../models/User');
const Article = require('../models/Article');

async function hasSellerPieceAccess(userId) {
  const user = await User.findById(userId).lean();
  if (!user) return false;
  const inscriptionDate = user.dateInscription || user.createdAt;
  if (inscriptionDate) {
    const trialEnd = new Date(inscriptionDate);
    trialEnd.setDate(trialEnd.getDate() + 90);
    if (new Date() <= trialEnd) return true;
  }
  const sub = await Subscription.findOne({ user: userId }).lean();
  return Boolean(sub && sub.expiresAt && new Date(sub.expiresAt) > new Date());
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
      }).lean()) || { prixMensuel: 5000 };
    const accessAllowed = await hasSellerPieceAccess(userId);
    await syncSellerPieceVisibility(userId, accessAllowed);

    if (!sub) {
      return res.json({ hasSubscription: false, monthlyPrice: pricing.prixMensuel || 5000 });
    }
    const hasSubscription = sub.expiresAt && new Date(sub.expiresAt) > new Date();
    return res.json({
      hasSubscription,
      activatedAt: sub.activatedAt,
      expiresAt: sub.expiresAt,
      plan: sub.plan,
      months: sub.months || 1,
      monthlyPrice: pricing.prixMensuel || 5000,
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
    const expiresAt = new Date(now);
    // monthly => +30 jours par mois acheté
    expiresAt.setDate(expiresAt.getDate() + 30 * months);

    const existing = await Subscription.findOne({ user: userId });
    if (existing) {
      // prolonge si encore actif, sinon redémarre
      const base = existing.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + 30 * months);
      existing.plan = plan;
      existing.months = months;
      existing.activatedAt = base;
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

    const sub = await Subscription.create({
      user: userId,
      plan,
      months,
      activatedAt: now,
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




