const DemoEvent = require('../models/DemoEvent');
const User = require('../models/User');
const admin = require('firebase-admin');

const resolveAgentForVendor = async (vendorUser) => {
  if (!vendorUser || vendorUser.role !== 'vendeur') return null;
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

exports.track = async (req, res) => {
  try {
    const user = req.user;
    if (!user || user.role !== 'vendeur') {
      return res.status(403).json({ message: 'Accès réservé aux vendeurs', code: 'VENDOR_ONLY' });
    }

    const { eventType, page, deviceId, meta } = req.body || {};
    if (!eventType) {
      return res.status(400).json({ message: 'eventType requis' });
    }
    console.log('[DEMO_EVENT] track request', {
      vendorMongoId: String(user._id),
      vendorUid: user.uid,
      vendorEmail: user.email,
      eventType,
      page,
      deviceId,
    });

    // Extraire auth_time depuis le token pour créer une "sessionKey" stable
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
    if (!idToken) return res.status(401).json({ message: 'Token manquant' });
    const decoded = await admin.auth().verifyIdToken(idToken);
    const authTimeSec = typeof decoded.auth_time === 'number' ? decoded.auth_time : null;
    if (!authTimeSec) {
      return res.status(400).json({ message: 'auth_time introuvable', code: 'AUTH_TIME_MISSING' });
    }
    const sessionKey = `${decoded.uid}:${authTimeSec}`;
    console.log('[DEMO_EVENT] decoded token', {
      uid: decoded.uid,
      auth_time: decoded.auth_time,
      sessionKey,
    });

    // Dédup léger (évite spam de clic)
    const dedupMs = Number(process.env.DEMO_EVENT_DEDUP_MS || 30 * 1000);
    const since = new Date(Date.now() - dedupMs);
    const exists = await DemoEvent.findOne({
      sessionKey,
      eventType,
      createdAt: { $gte: since },
    })
      .select('_id')
      .lean();
    if (exists) {
      console.log('[DEMO_EVENT] dedup hit', { sessionKey, eventType });
      return res.status(200).json({ message: 'Event dédupliqué', sessionKey, eventType });
    }

    const agentId = await resolveAgentForVendor(user);
    console.log('[DEMO_EVENT] resolved agent', { agentId: agentId ? String(agentId) : null });

    await DemoEvent.create({
      user: user._id,
      uid: user.uid,
      agent: agentId,
      sessionKey,
      eventType: String(eventType),
      page: page ? String(page) : null,
      deviceId: deviceId ? String(deviceId) : null,
      meta: meta && typeof meta === 'object' ? meta : null,
      ip: req.ip || null,
      userAgent: req.headers['user-agent'] || null,
    });

    return res.status(201).json({
      message: 'Event enregistré',
      sessionKey,
      eventType: String(eventType),
      agentId: agentId ? String(agentId) : null,
    });
  } catch (err) {
    console.error('[DEMO_EVENT] error', err);
    return res.status(500).json({ message: 'Erreur tracking demo event', error: err.message });
  }
};

