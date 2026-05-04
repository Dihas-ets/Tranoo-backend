const AuthEvent = require('../models/AuthEvent');
const User = require('../models/User');

const getLinkedAgentForVendor = async (vendorUser) => {
  if (!vendorUser) return null;
  if (vendorUser.role !== 'vendeur') return null;

  // 1) lien explicite (si présent)
  if (vendorUser.proVendorAccount?.userId) return null;

  // 2) chercher l’agent qui référence ce vendeur via proVendorAccount / mobileCredentials
  const agent = await User.findOne({
    role: 'agentCommercial',
    typeAgent: 'Tranoo_pro',
    $or: [
      { 'proVendorAccount.uid': vendorUser.uid },
      { 'proVendorAccount.email': vendorUser.email },
      { 'mobileCredentials.login': vendorUser.email },
    ],
  })
    .select('_id')
    .lean();

  return agent?._id || null;
};

const recordEvent = async ({ req, res, eventType }) => {
  try {
    const user = req.user;
    const uid = user.uid;
    const deviceId = req.body?.deviceId ? String(req.body.deviceId).trim() : null;
    const client = req.body?.client ? String(req.body.client).trim() : 'mobile';

    // Anti-bruit: si même eventType sur même device dans les 2 dernières minutes => ignore
    const dedupWindowMs = Number(process.env.AUTH_EVENT_DEDUP_MS || 2 * 60 * 1000);
    const since = new Date(Date.now() - dedupWindowMs);
    const last = await AuthEvent.findOne({
      uid,
      eventType,
      deviceId: deviceId || null,
      createdAt: { $gte: since },
    })
      .select('_id createdAt')
      .lean();
    if (last) {
      return res.status(200).json({ message: 'Evènement déjà enregistré (dédupliqué)' });
    }

    const linkedAgentId = user.role === 'vendeur' ? await getLinkedAgentForVendor(user) : null;

    await AuthEvent.create({
      user: user._id,
      uid,
      role: user.role,
      agent: linkedAgentId,
      eventType,
      deviceId: deviceId || null,
      client,
      ip: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    return res.status(201).json({ message: 'Evènement enregistré' });
  } catch (err) {
    return res.status(500).json({ message: "Erreur enregistrement évènement d'auth", error: err.message });
  }
};

exports.recordLogin = async (req, res) => recordEvent({ req, res, eventType: 'login' });
exports.recordLogout = async (req, res) => recordEvent({ req, res, eventType: 'logout' });

