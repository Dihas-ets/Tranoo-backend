const Subscription = require('../models/Subscription');

// GET /api/subscription/me
exports.getMySubscription = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });
    let sub = await Subscription.findOne({ user: userId }).lean();
    if (!sub) return res.json({ hasSubscription: false });
    const hasSubscription = sub.expiresAt && new Date(sub.expiresAt) > new Date();
    return res.json({
      hasSubscription,
      activatedAt: sub.activatedAt,
      expiresAt: sub.expiresAt,
      plan: sub.plan,
      status: hasSubscription ? 'active' : 'expired',
    });
  } catch (e) {
    return res.status(500).json({ message: 'Erreur récupération abonnement', error: e?.message });
  }
};

// POST /api/subscription/subscribe { plan?: 'monthly' }
exports.subscribe = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });
    const plan = (req.body?.plan || 'monthly').toLowerCase();
    const now = new Date();
    const expiresAt = new Date(now);
    // monthly => +30 jours
    expiresAt.setDate(expiresAt.getDate() + 30);

    const existing = await Subscription.findOne({ user: userId });
    if (existing) {
      // prolonge si encore actif, sinon redémarre
      const base = existing.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
      const newExpiry = new Date(base);
      newExpiry.setDate(newExpiry.getDate() + 30);
      existing.plan = plan;
      existing.activatedAt = base;
      existing.expiresAt = newExpiry;
      existing.status = 'active';
      await existing.save();
      return res.json({ message: 'Abonnement prolongé', activatedAt: existing.activatedAt, expiresAt: existing.expiresAt, plan: existing.plan, status: existing.status });
    }

    const sub = await Subscription.create({ user: userId, plan, activatedAt: now, expiresAt, status: 'active' });
    return res.status(201).json({ message: 'Abonnement activé', activatedAt: sub.activatedAt, expiresAt: sub.expiresAt, plan: sub.plan, status: sub.status });
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
    
    return res.json({
      hasSubscription,
      status: hasSubscription ? 'active' : 'expired',
      expiresAt: sub.expiresAt,
      activatedAt: sub.activatedAt
    });
  } catch (e) {
    return res.status(500).json({ message: 'Erreur vérification statut', error: e?.message });
  }
};




