const axios = require('axios');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Achat = require('../models/Achat');
const Article = require('../models/Article');
const Publicite = require('../models/Publicite');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Referral = require('../models/Referral');
const AgentEarning = require('../models/AgentEarning');
const ReferralSettings = require('../models/ReferralSettings');

function isObjectIdLike(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

async function resolveClientLabel(payment) {
  const rawUser = payment?.user;
  const userId =
    typeof rawUser === 'string'
      ? rawUser
      : rawUser?._id
      ? String(rawUser._id)
      : null;

  if (!userId) return 'Client inconnu';
  if (!isObjectIdLike(userId)) {
    if (userId === 'enterprise') return 'Entreprise Tranoo';
    return userId;
  }

  try {
    const u = await User.findById(userId).select('nom prenoms email').lean();
    if (!u) return 'Client inconnu';
    return `${u.nom || ''} ${u.prenoms || ''}`.trim() || 'Client inconnu';
  } catch (_) {
    return 'Client inconnu';
  }
}

/** API Payin / statuts publics (doc V2 : https://api-v2.feexpay.me) */
const FEEXPAY_BASE_URL = process.env.FEEXPAY_BASE_URL || 'https://api-v2.feexpay.me';
/** FeexLink (api-create / api-status) reste souvent sur l’hôte classique si non migré. */
const FEEXPAY_FEEXLINK_BASE_URL =
  process.env.FEEXPAY_FEEXLINK_BASE_URL || 'https://api.feexpay.me';
const FEEXPAY_SHOP_ID = process.env.FEEXPAY_SHOP_ID || '';
const FEEXPAY_API_TOKEN = process.env.FEEXPAY_API_TOKEN || '';
const FEEXPAY_MODE = process.env.FEEXPAY_MODE || 'SANDBOX';
const FEEXLINK_DISABLED = String(process.env.FEEXLINK_DISABLED || 'true').toLowerCase() === 'true';
const EXPIRE_SECONDS = Number(process.env.PAYMENT_EXPIRE_SECONDS || 900);
const FEEXPAY_DISABLE_LOCAL_EXPIRY = String(process.env.FEEXPAY_DISABLE_LOCAL_EXPIRY || 'true').toLowerCase() === 'true';

async function getReferralSettings() {
  let settings = await ReferralSettings.findOne();
  if (!settings) {
    settings = new ReferralSettings();
    await settings.save();
  }
  return settings;
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${FEEXPAY_API_TOKEN}`,
    'X-Shop-ID': FEEXPAY_SHOP_ID,
    'User-Agent': 'TranooAPI/1.0',
  };
}

/** Doc V2 Payin : GET public/single/status n’exige que Authorization Bearer. */
function getBearerOnlyHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${FEEXPAY_API_TOKEN}`,
    'User-Agent': 'TranooAPI/1.0',
  };
}

const FEEXPAY_UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

function isUuidTransactionRef(value) {
  return typeof value === 'string' && FEEXPAY_UUID_REGEX.test(value.trim());
}

function extractRawStatusFromFeexPayload(data) {
  if (!data || typeof data !== 'object') return null;
  const nested =
    (data.data && typeof data.data === 'object' && data.data) ||
    (data.transaction && typeof data.transaction === 'object' && data.transaction) ||
    (data.payment && typeof data.payment === 'object' && data.payment) ||
    null;
  const fromNested = nested
    ? nested.payment_status ||
      nested.paymentStatus ||
      nested.status ||
      nested.state ||
      nested.result ||
      null
    : null;
  return (
    fromNested ||
    data.payment_status ||
    data.paymentStatus ||
    data.status ||
    data.state ||
    data.result ||
    null
  );
}

/**
 * Statut FeexPay distant : UUID → GET V2 …/transactions/public/single/status ;
 * sinon (short_code, FeexLink…) → GET legacy …/feexlink/api-status puis fallbacks.
 */
async function fetchFeexPayRemoteStatus(ref) {
  const id = String(ref || '').trim();
  if (!id) return { mapped: null, raw: null, resolvedId: null };

  if (isUuidTransactionRef(id)) {
    try {
      const url = `${FEEXPAY_BASE_URL}/api/transactions/public/single/status/${id}`;
      const fp = await axios.get(url, { headers: getBearerOnlyHeaders(), timeout: 10000 });
      const raw = fp.data;
      const fpStatus = extractRawStatusFromFeexPayload(raw);
      return { mapped: mapStatus(fpStatus), raw, resolvedId: id };
    } catch (e) {
      console.error('[FeexPay][status][uuid]', id, e.response?.data || e.message);
      return { mapped: null, raw: null, resolvedId: id };
    }
  }

  try {
    const linkUrl = `${FEEXPAY_FEEXLINK_BASE_URL}/api/feexlink/api-status/${encodeURIComponent(id)}`;
    const fpLink = await axios.get(linkUrl, { headers: getAuthHeaders(), timeout: 10000 });
    const rawLink = fpLink.data;
    const st = extractRawStatusFromFeexPayload(rawLink);
    if (st != null && String(st).trim() !== '') {
      const resolved =
        rawLink.id_transaction ||
        rawLink.transaction_id ||
        rawLink.transactionId ||
        id;
      return { mapped: mapStatus(st), raw: rawLink, resolvedId: String(resolved || id) };
    }
  } catch (e) {
    console.warn('[FeexPay][status][feexlink]', id, e.response?.data || e.message);
  }

  if (id.length === 8 && /^[A-Za-z0-9]{8}$/.test(id)) {
    const realUuid = await getRealTransactionId(id);
    if (realUuid && realUuid !== id) {
      return fetchFeexPayRemoteStatus(realUuid);
    }
  }

  try {
    const url = `${FEEXPAY_BASE_URL}/api/transactions/public/single/status/${encodeURIComponent(id)}`;
    const fp = await axios.get(url, { headers: getBearerOnlyHeaders(), timeout: 10000 });
    const raw = fp.data;
    const fpStatus = extractRawStatusFromFeexPayload(raw);
    return { mapped: mapStatus(fpStatus), raw, resolvedId: id };
  } catch (e) {
    console.error('[FeexPay][status][direct]', id, e.response?.data || e.message);
    return { mapped: null, raw: null, resolvedId: id };
  }
}

// --- Nouveaux endpoints: RequestToPay par réseau et cartes ---

/**
 * Initier un RequestToPay pour un réseau donné (mtn, moov, celtiis_bj, coris, orange_sn, ...)
 * Route: POST /api/payments/feexpay/requesttopay/:network
 * Body attendu: { amount, phoneNumber, description?, firstName?, lastName?, customId, achatId?, publiciteId?, currency? }
 */
exports.initRequestToPay = async (req, res) => {
  try {
    const { network } = req.params; // ex: mtn, moov, celtiis_bj, coris, orange_sn, ...
    const {
      amount,
      phoneNumber,
      description,
      firstName,
      lastName,
      customId,
      achatId,
      publiciteId,
      currency = 'XOF',
      otp, // pour coris et assimilés
      type = 'achat',
      duree,
    } = req.body || {};

    if (!amount || !customId) {
      return res.status(400).json({ message: 'amount et customId requis' });
    }
    if (!phoneNumber) {
      return res.status(400).json({ message: 'phoneNumber requis' });
    }
    if (!network) {
      return res.status(400).json({ message: 'network requis' });
    }

    // URL d'initiation suivant le réseau
    const requestUrl = `${FEEXPAY_BASE_URL}/api/transactions/public/requesttopay/${network}`;

    const payload = {
      shop: FEEXPAY_SHOP_ID,
      amount: Number(amount),
      phoneNumber,
      firstName,
      lastName,
      description,
    };
    if (otp) payload.otp = otp;

    console.log(`[RTP][${network}] payload =>`, payload);

    const fpRes = await axios({
      url: requestUrl,
      method: 'post',
      headers: getAuthHeaders(),
      data: payload,
      timeout: 30000,
    });

    const data = fpRes.data || {};
    console.log(`[RTP][${network}] response <=`, JSON.stringify(data, null, 2));

    // FeexPay renvoie différents identifiants selon le réseau
    const returnedId =
      data.reference || data.transref || data.transRef || data.order_id || data.id || data.short_code || null;
    const paymentUrl = data.payment_url || data.url || null;
    const immediateStatus = data.status || data.result || data.state || null;

    if (!returnedId && !paymentUrl) {
      return res.status(502).json({ message: 'Réponse inattendue de FeexPay (pas d\'identifiant)', data });
    }

    const payment = await Payment.create({
      provider: 'feexpay',
      transactionId: returnedId || null,
      customId,
      achat: achatId || undefined,
      publicite: publiciteId || undefined,
      user: req.user?._id,
      amount: Number(amount),
      currency,
      status: mapStatus(immediateStatus) || 'pending',
      method: network,
      description,
      type,
      duree,
      rawInitResponse: data,
    });

    if (payment.status === 'success') {
      await handleSuccessfulPayment(payment);
    }

    return res.json({
      ok: true,
      paymentId: payment._id,
      transactionId: payment.transactionId,
      paymentUrl,
      raw: data,
    });
  } catch (error) {
    console.error('[initRequestToPay] error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Détails erreur:', error.response.status, error.response.data);
    }
    return res.status(500).json({ message: 'Erreur init RequestToPay', error: error.response?.data || error.message });
  }
};

/**
 * Initier un paiement par carte
 * Route: POST /api/payments/feexpay/initcard
 * Body: { amount, phone, first_name, last_name, email, type_card, customId, ... }
 */
exports.initCardPayment = async (req, res) => {
  try {
    const {
      amount,
      phone,
      first_name,
      last_name,
      email,
      type_card, // VISA | MASTERCARD
      description,
      currency = 'XOF',
      customId,
      achatId,
      publiciteId,
      type = 'achat',
      duree,
    } = req.body || {};

    if (!amount || !customId) {
      return res.status(400).json({ message: 'amount et customId requis' });
    }

    const requestUrl = `${FEEXPAY_BASE_URL}/api/transactions/public/initcard`;
    const payload = {
      amount: Number(amount),
      phone,
      first_name,
      last_name,
      email,
      type_card,
      description,
      currency,
      shop: FEEXPAY_SHOP_ID,
    };
    // Pas de redirections UI pendant les tests

    console.log('[CARD] payload =>', payload);

    const fpRes = await axios.post(requestUrl, payload, { headers: getAuthHeaders(), timeout: 30000 });
    const data = fpRes.data || {};

    console.log('[CARD] response <=', JSON.stringify(data, null, 2));

    const returnedId = data.reference || data.order_id || data.id || null;
    const paymentUrl = data.url || data.payment_url || null;
    const immediateStatus = data.status || data.result || data.state || null;

    const payment = await Payment.create({
      provider: 'feexpay',
      transactionId: returnedId || null,
      customId,
      achat: achatId || undefined,
      publicite: publiciteId || undefined,
      user: req.user?._id,
      amount: Number(amount),
      currency,
      status: mapStatus(immediateStatus) || 'pending',
      method: 'CARD',
      description,
      type,
      duree,
      rawInitResponse: data,
    });

    return res.json({ ok: true, paymentId: payment._id, transactionId: payment.transactionId, paymentUrl, raw: data });
  } catch (error) {
    console.error('[initCardPayment] error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Détails erreur:', error.response.status, error.response.data);
    }
    return res.status(500).json({ message: 'Erreur init carte', error: error.response?.data || error.message });
  }
};

// Fonction pour récupérer le vrai transactionId depuis la liste des transactions
async function getRealTransactionId(shortCode) {
  try {
    console.log('Recherche du vrai transactionId pour le code court:', shortCode);
    
    // Appeler l'endpoint de liste des transactions
    const listUrl = `${FEEXPAY_BASE_URL}/api/transactions?page=1&limit=50`;
    const response = await axios.get(listUrl, {
      headers: getAuthHeaders(),
      timeout: 15000
    });
    
    console.log('Liste des transactions récupérée, recherche du code court...');
    
    if (response.data && response.data.data && response.data.data.length > 0) {
      // Chercher la transaction avec notre code court
      const transaction = response.data.data.find(tx => {
        return tx.short_code === shortCode || 
               tx.reference === shortCode ||
               (tx.payment_link && tx.payment_link.includes(shortCode)) ||
               (tx.id && tx.id.includes(shortCode));
      });
      
      if (transaction && transaction.id) {
        console.log('✅ TransactionId trouvé:', transaction.id);
        return transaction.id;
      } else {
        console.log('❌ Aucune transaction trouvée avec le code court:', shortCode);
      }
    }
    
    return null;
    
  } catch (error) {
    console.error('Erreur récupération transactionId:', error.response?.data || error.message);
    return null;
  }
}

exports.initPayment = async (req, res) => {
  try {
    if (FEEXLINK_DISABLED) {
      return res.status(400).json({ message: 'FeexLink désactivé. Utilisez /api/payments/feexpay/requesttopay/:network ou /feexpay/initcard.' });
    }
    const { amount, description, customId, achatId, publiciteId, currency = 'XOF', method, type = 'achat', duree } = req.body;
    if (!amount || !customId) {
      return res.status(400).json({ message: 'amount et customId requis' });
    }

    const payload = {
      shop: FEEXPAY_SHOP_ID,
      amount: Number(amount),
      description: description || 'Tranoo paiement',
      paymentMethod: method && typeof method === 'string' ? method.toUpperCase() : 'ALL',
      range: 1,
      expireIn: Math.floor(EXPIRE_SECONDS / 60),
      mode: FEEXPAY_MODE,
    };
    // Pas de redirections UI pendant les tests

    console.log('Initialisation paiement FeexPay avec payload:', payload);

    const initUrl = `${FEEXPAY_FEEXLINK_BASE_URL}/api/feexlink/api-create`;
    const fpRes = await axios.post(initUrl, payload, { 
      headers: getAuthHeaders(), 
      timeout: 30000 
    });

    const data = fpRes.data || {};
    console.log('Réponse FeexPay init:', JSON.stringify(data, null, 2));

    const paymentUrl = data.urlPay || data.payment_url || data.url || null;
    if (!paymentUrl) {
      return res.status(502).json({ message: 'Réponse inattendue de FeexPay (pas de payment URL)', data });
    }

    // Extraction du code court depuis l'URL FeexLink
    let shortCode = null;
    try {
      const urlObj = new URL(paymentUrl);
      const pathParts = urlObj.pathname.split('/').filter(part => part);
      shortCode = pathParts[0];
    } catch (e) {
      console.warn('Impossible d\'extraire le code court de l\'URL:', e.message);
    }

    const payment = await Payment.create({
      provider: 'feexpay',
      transactionId: shortCode,
      customId,
      achat: achatId || undefined,
      publicite: publiciteId || undefined,
      user: req.user?._id,
      amount: Number(amount),
      currency,
      status: 'pending',
      method,
      description,
      type,
      duree,
      rawInitResponse: data,
    });

    console.log('Paiement créé avec code court:', shortCode);

    // Tentative immédiate de résolution du vrai transactionId (en arrière-plan)
    if (shortCode && /^[A-Za-z0-9]{8}$/.test(shortCode)) {
      getRealTransactionId(shortCode)
        .then(async (realId) => {
          if (realId && realId !== payment.transactionId) {
            payment.transactionId = realId;
            await payment.save().catch(() => {});
            console.log('🔁 transactionId mis à jour immédiatement après init =>', realId);
          }
        })
        .catch(() => {});
    }

    return res.json({ 
      paymentUrl, 
      transactionId: shortCode, 
      paymentId: payment._id,
      shortCode: shortCode
    });
  } catch (error) {
    console.error('[initPayment] error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Détails erreur:', error.response.status, error.response.data);
    }
    return res.status(500).json({ 
      message: 'Erreur initialisation paiement', 
      error: error.response?.data || error.message 
    });
  }
};

function mapStatus(fpStatus) {
  const s = (fpStatus || '').toString().toLowerCase().trim();
  if (!s) return 'pending';
  // API V2 Payin / webhook : SUCCESSFUL, PENDING, FAILED (cf. doc FeexPay)
  if (s === 'successful' || s === 'successfull') return 'success';
  if (
    s === 'success' ||
    s === 'successful' ||
    s === 'paid' ||
    s === 'completed' ||
    s === 'approved' ||
    s === 'ok'
  ) {
    return 'success';
  }
  if (
    s === 'failed' ||
    s === 'fail' ||
    s === 'error' ||
    s === 'declined' ||
    s === 'rejected'
  ) {
    return 'failed';
  }
  if (
    s === 'cancelled' ||
    s === 'canceled' ||
    s === 'expired' ||
    s.includes('annul')
  ) {
    return 'cancelled';
  }
  if (
    s === 'processing' ||
    s === 'authorized' ||
    s === 'waiting' ||
    s === 'pending' ||
    s === 'in pending state'
  ) {
    return 'pending';
  }
  if (s.includes('success') || s.includes('paid') || s.includes('approv')) return 'success';
  if (s.includes('fail') || s.includes('declin') || s.includes('reject')) return 'failed';
  if (s.includes('cancel') || s.includes('expir')) return 'cancelled';
  return 'pending';
}

exports.webhook = async (req, res) => {
  try {
    console.log('Webhook FeexPay reçu:', JSON.stringify(req.body, null, 2));
    
    const payload = req.body;
    const {
      transaction_id,
      transactionId,
      id_transaction,
      reference,
      order_id,
      status,
      amount,
      custom_id,
      short_code,
    } = payload;

    const actualTransactionId =
      transaction_id ||
      transactionId ||
      id_transaction ||
      reference ||
      order_id ||
      short_code;
    
    if (!actualTransactionId) {
      console.error('Webhook sans identifiant de transaction');
      return res.status(400).json({ error: 'Identifiant de transaction manquant' });
    }

    const orConds = [
      { transactionId: actualTransactionId },
      { transactionId: String(actualTransactionId) },
      { 'rawInitResponse.transKey': actualTransactionId },
      { 'rawInitResponse.feexTransactionId': actualTransactionId },
    ];
    if (custom_id) {
      orConds.push({ customId: custom_id });
      orConds.push({ customId: String(custom_id) });
    }

    let payment = await Payment.findOne({ $or: orConds });

    if (!payment && custom_id) {
      payment = await Payment.findOne({ customId: custom_id });
    }

    if (!payment) {
      console.log('Création nouveau paiement depuis webhook');
      payment = await Payment.create({
        provider: 'feexpay',
        transactionId: actualTransactionId,
        customId: custom_id,
        amount: Number(amount),
        status: mapStatus(status),
        rawWebhookPayload: payload,
      });
      return res.json({ ok: true });
    }

    const newStatus = mapStatus(status);
    console.log(
      '[WEBHOOK_FEEXPAY]',
      JSON.stringify({
        actualTransactionId,
        custom_id: custom_id || null,
        rawStatus: status,
        mapped: newStatus,
        previous: payment.status,
        paymentId: String(payment._id),
      })
    );

    if (payment.status === 'success' && newStatus !== 'success') {
      console.log('[WEBHOOK_FEEXPAY] conserve success — pas de rétrogradation vers', newStatus);
      payment.rawWebhookPayload = payload;
      await payment.save();
      return res.json({ ok: true, note: 'ignored_downgrade_from_success' });
    }

    console.log('Mise à jour statut:', payment.status, '->', newStatus);

    payment.status = newStatus;
    payment.rawWebhookPayload = payload;
    await payment.save();

    if (payment.status === 'success') {
      await handleSuccessfulPayment(payment);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('[webhook] error:', error);
    return res.status(500).json({ message: 'Erreur webhook', error: error.message });
  }
};

async function resolvePayerUserLean(rawUserId) {
  if (rawUserId == null) return null;
  const s = String(rawUserId).trim();
  if (!s) return null;
  if (mongoose.Types.ObjectId.isValid(s)) {
    const byId = await User.findById(s).lean();
    if (byId) return byId;
  }
  const byUid = await User.findOne({ uid: s }).lean();
  if (byUid) return byUid;
  return null;
}

async function handleSuccessfulPayment(payment) {
  try {
    if (payment.achat) {
      const achat = await Achat.findById(payment.achat);
      if (achat && achat.article) {
        const article = await Article.findById(achat.article);
        if (article && article.statutVente !== 'vendu') {
          article.statutVente = 'vendu';
          if (!article.dateAchat) article.dateAchat = new Date();
          await article.save();
          console.log('Article marqué comme vendu:', article._id);
        }
      }
    }
    
    if (payment.publicite) {
      const publicite = await Publicite.findById(payment.publicite);
      if (publicite) {
        publicite.statutPaiement = 'success';
        publicite.datePaiement = new Date();
        if (publicite.statut === 'en_attente') {
          publicite.statut = 'payee';
        }
        await publicite.save();
        console.log('Publicité marquée comme payée:', publicite._id);
      }
    }

    if (payment.type === 'subscription' && payment.user) {
      try {
        const monthsFromDuree = (() => {
          const raw = (payment.duree || '').toString();
          const match = raw.match(/(\d+)/);
          return match ? Number(match[1]) : 1;
        })();
        const months = Math.max(1, Math.min(Number(monthsFromDuree) || 1, 24));
        const now = new Date();
        const existing = await Subscription.findOne({ user: payment.user });
        if (existing) {
          const base =
            existing.expiresAt && existing.expiresAt > now
              ? existing.expiresAt
              : now;
          const newExpiry = new Date(base);
          newExpiry.setDate(newExpiry.getDate() + 30 * months);
          existing.plan = 'monthly';
          existing.months = months;
          const prevAct = existing.activatedAt ? new Date(existing.activatedAt) : null;
          if (!prevAct || Number.isNaN(prevAct.getTime()) || prevAct > now) {
            existing.activatedAt = now;
          }
          existing.expiresAt = newExpiry;
          existing.status = 'active';
          await existing.save();
        } else {
          const expiresAt = new Date(now);
          expiresAt.setDate(expiresAt.getDate() + 30 * months);
          await Subscription.create({
            user: payment.user,
            plan: 'monthly',
            months,
            activatedAt: now,
            expiresAt,
            status: 'active',
          });
        }
        console.log('Abonnement vendeur active/renouvele pour user:', payment.user);
      } catch (subErr) {
        console.error(
          '[SUBSCRIPTION_SYNC][ERR] sync Subscription depuis paiement — la suite (commissions) continue',
          payment._id?.toString?.(),
          subErr?.message || subErr
        );
      }
    }

    // Commissions (paramétrables) pour l'agent commercial si l'utilisateur payeur a été parrainé par un agent
    const isSubscriptionPayment = payment.type === 'subscription';
    const isPublicitePayment = payment.type === 'publicite' || !!payment.publicite;
    if (payment.user && (isSubscriptionPayment || isPublicitePayment)) {
      try {
        console.log(
          '[AGENT_COMMISSION][START]',
          JSON.stringify({
            paymentId: String(payment._id),
            paymentType: payment.type,
            hasPubliciteRef: Boolean(payment.publicite),
            amount: Number(payment.amount) || 0,
            user: String(payment.user),
          })
        );
        const settings = await getReferralSettings();
        const commissionRatePercent = Number.isFinite(settings.agentCommissionRate)
          ? settings.agentCommissionRate
          : 10;
        const payer = await resolvePayerUserLean(payment.user);
        console.log(
          '[AGENT_COMMISSION][PAYER]',
          JSON.stringify({
            paymentId: String(payment._id),
            paymentUserRaw: payment.user != null ? String(payment.user) : null,
            payerFound: Boolean(payer),
            payerId: payer ? String(payer._id) : null,
            payerRole: payer?.role || null,
            payerUid: payer?.uid || null,
          })
        );
        if (!payer) {
          console.log(
            '[AGENT_COMMISSION][SKIP] payeur introuvable (ni _id Mongo ni uid Firebase)',
            JSON.stringify({ paymentId: String(payment._id), userRaw: String(payment.user) })
          );
        }
        if (payer && (payer.role === 'vendeur' || payer.role === 'transitaire')) {
          // Referral en .lean() + chargement explicite du parrain (populate peut omettre role selon versions).
          const referral = await Referral.findOne({ referredId: payer._id })
            .sort({ createdAt: -1 })
            .lean();
          const referralSource = referral?.status || 'none';
          let referrerUser = null;
          if (referral?.referrerId) {
            referrerUser = await User.findById(referral.referrerId)
              .select('role nom prenoms email referralCode')
              .lean();
          }
          console.log(
            '[AGENT_COMMISSION][REFERRAL]',
            JSON.stringify({
              paymentId: String(payment._id),
              hasReferral: Boolean(referral),
              referralId: referral ? String(referral._id) : null,
              referralStatus: referralSource,
              referrerIdRaw: referral?.referrerId != null ? String(referral.referrerId) : null,
              referrerRoleResolved: referrerUser?.role || null,
              referrerNom: referrerUser
                ? `${referrerUser.nom || ''} ${referrerUser.prenoms || ''}`.trim()
                : null,
            })
          );
          if (!referral) {
            console.log(
              '[AGENT_COMMISSION][SKIP] aucun Referral pour ce payeur',
              JSON.stringify({
                paymentId: String(payment._id),
                payerId: String(payer._id),
                payerRole: payer.role,
              })
            );
          }
          if (referral && referrerUser && referrerUser.role === 'agentCommercial') {
            // ceil: avec montants test très bas (ex. 2 FCFA × 10 % = 0,2) Math.round donnait 0
            // et aucune ligne AgentEarning n'était créée (revenue abonnement à 0 dans les KPI).
            const commission = Math.ceil(
              (Number(payment.amount) || 0) * (commissionRatePercent / 100)
            );
            console.log(
              '[AGENT_COMMISSION][CALC]',
              JSON.stringify({
                paymentId: String(payment._id),
                isSubscriptionPayment,
                isPublicitePayment,
                amount: Number(payment.amount) || 0,
                commissionRatePercent,
                commissionRounded: commission,
              })
            );
            if (commission > 0) {
              const earningType = isSubscriptionPayment ? 'commission_subscription' : 'commission_publicite';
              // Index unique partiel sur sourcePayment : au plus une ligne AgentEarning par Payment.
              const existingForPayment = await AgentEarning.findOne({
                sourcePayment: payment._id,
              })
                .select('_id type')
                .lean();
              if (existingForPayment) {
                console.log(
                  '[AGENT_COMMISSION][SKIP] AgentEarning déjà lié à ce paiement',
                  JSON.stringify({
                    paymentId: String(payment._id),
                    existingType: existingForPayment.type,
                    requestedType: earningType,
                  })
                );
              } else {
                try {
                  await AgentEarning.create({
                    agent: referrerUser._id,
                    type: earningType,
                    amount: commission,
                    sourcePayment: payment._id,
                    referredUser: payer._id,
                  });
                  console.log(
                    '[AGENT_COMMISSION][CREATED]',
                    JSON.stringify({
                      paymentId: String(payment._id),
                      agentId: String(referrerUser._id),
                      payerId: String(payer._id),
                      referralId: String(referral._id),
                      referralStatus: referral.status || null,
                      referralSource,
                      earningType,
                      commission,
                    })
                  );
                } catch (earnErr) {
                  console.error(
                    '[AGENT_COMMISSION][ERR] création AgentEarning',
                    payment._id?.toString?.(),
                    earnErr?.message || earnErr,
                    earnErr?.code || ''
                  );
                }
              }
            } else {
              console.log(
                '[AGENT_COMMISSION][SKIP] commission nulle (montant ou taux)',
                JSON.stringify({
                  paymentId: String(payment._id),
                  amount: Number(payment.amount) || 0,
                  commissionRatePercent,
                })
              );
            }
          } else if (referral && referrerUser) {
            console.log(
              '[AGENT_COMMISSION][SKIP] parrain trouvé mais rôle non agentCommercial',
              JSON.stringify({
                paymentId: String(payment._id),
                payerId: String(payer._id),
                referrerId: String(referrerUser._id),
                referrerRole: referrerUser.role || null,
                referralStatus: referral.status || null,
                referralSource,
              })
            );
          } else if (referral && !referrerUser) {
            console.log(
              '[AGENT_COMMISSION][SKIP] referral.referrerId invalide ou utilisateur parrain supprimé',
              JSON.stringify({
                paymentId: String(payment._id),
                referrerIdRaw: String(referral.referrerId),
              })
            );
          }
        } else if (payer) {
          console.log(
            '[AGENT_COMMISSION][SKIP] role non éligible',
            JSON.stringify({
              paymentId: String(payment._id),
              payerId: String(payer._id),
              payerRole: payer.role,
            })
          );
        }
        console.log(
          '[AGENT_COMMISSION][END]',
          JSON.stringify({
            paymentId: String(payment._id),
            paymentType: payment.type,
            amount: Number(payment.amount) || 0,
          })
        );
      } catch (e) {
        console.error('Erreur commission agent:', e.message);
      }
    }
  } catch (e) {
    console.error('Erreur reconciliation:', e);
  }
}

exports.getStatus = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('getStatus appelé avec id:', id);
    
    let payment = await Payment.findById(id);
    if (!payment) {
      payment = await Payment.findOne({ transactionId: id });
    }
    if (!payment) return res.status(404).json({ message: 'Paiement non trouvé' });

    if (payment.status === 'pending') {
      try {
        const transactionIdToCheck = payment.transactionId;
        if (transactionIdToCheck) {
          const prevStatus = payment.status;
          const { mapped, raw, resolvedId } = await fetchFeexPayRemoteStatus(transactionIdToCheck);
          if (mapped) {
            payment.rawStatusResponse = raw;
            if (resolvedId && payment.transactionId !== resolvedId) {
              payment.transactionId = resolvedId;
            }
            if (mapped !== payment.status) {
              console.log('Mise à jour statut:', payment.status, '->', mapped);
              payment.status = mapped;
              await payment.save();
              if (prevStatus !== 'success' && payment.status === 'success') {
                await handleSuccessfulPayment(payment);
              }
            } else if (resolvedId) {
              await payment.save();
            }
          }
        }
      } catch (e) {
        console.error('Erreur interrogation statut:', e.response?.data || e.message);
        if (e.response) {
          console.error('Détails erreur:', e.response.status, e.response.data);
        }
      }

      // Expiration locale désactivable (évite faux "failed" si webhook/status en retard)
      try {
        if (!FEEXPAY_DISABLE_LOCAL_EXPIRY) {
          const ageSec = (Date.now() - new Date(payment.createdAt).getTime()) / 1000;
          if (payment.status === 'pending' && ageSec > EXPIRE_SECONDS) {
            payment.status = 'failed';
            await payment.save();
            console.log('⏰ Paiement expiré automatiquement');
          }
        }
      } catch (_) {}
    }

    return res.json({ status: payment.status, payment });
  } catch (error) {
    console.error('Erreur getStatus:', error);
    return res.status(500).json({ message: 'Erreur récupération statut', error: error.message });
  }
};

exports.getPublicStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentId } = req.query;
    
    if (!id) return res.status(400).json({ message: 'id requis' });
    
    console.log('getPublicStatus appelé avec id:', id, 'paymentId:', paymentId);

    const { mapped, raw, resolvedId } = await fetchFeexPayRemoteStatus(id);
    const usedFeexLinkFirst = !isUuidTransactionRef(id);

    console.log(
      '[PUBLIC_STATUS]',
      JSON.stringify({
        idParam: id,
        mapped: mapped || null,
        resolvedId: resolvedId || null,
        usedFeexLinkFirst,
        rawStatusSnippet:
          raw && typeof raw === 'object'
            ? (raw.status || raw.payment_status || raw.state || null)
            : raw,
      })
    );

    if (!mapped) {
      console.warn('[PUBLIC_STATUS] mapped null — vérifiez que id est bien l’UUID FeexPay (pas seulement trans_key).');
    }

    if (paymentId) {
      try {
        const payment = await Payment.findById(paymentId);
        if (payment && mapped) {
          const prevStatus = payment.status;
          if (resolvedId && payment.transactionId !== resolvedId) {
            payment.transactionId = resolvedId;
            console.log('✅ TransactionId mis à jour dans la base:', resolvedId);
          }

          if (payment.status !== mapped) {
            console.log('Mise à jour statut depuis public:', payment.status, '->', mapped);
            payment.status = mapped;
          }
          payment.rawStatusResponse = raw;
          await payment.save();
          if (prevStatus !== 'success' && payment.status === 'success') {
            await handleSuccessfulPayment(payment);
          }
        }
      } catch (e) {
        console.error('Erreur mise à jour paiement:', e.message);
      }
    }

    return res.json({
      status: mapped || 'pending',
      id_transaction: resolvedId || id,
      is_short_code: usedFeexLinkFirst,
      raw,
    });
  } catch (error) {
    console.error('Erreur getPublicStatus:', error.response?.data || error.message);
    return res.status(500).json({ 
      message: 'Erreur statut public', 
      error: error.response?.data || error.message 
    });
  }
};

exports.traceFromClient = async (req, res) => {
  try {
    const { paymentId, url, text, html, message } = req.body || {};
    if (!paymentId) return res.status(400).json({ message: 'paymentId requis' });

    const corpus = [url || '', text || '', html || '', message || ''].join(' \n ');
    
    let detectedId = null;
    
    // Recherche d'UUID
    let match = corpus.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/);
    if (match) detectedId = match[0];
    
    // Recherche de code court (8 caractères)
    if (!detectedId) {
      const shortCodeMatch = corpus.match(/[A-Za-z0-9]{8}/);
      if (shortCodeMatch) detectedId = shortCodeMatch[0];
    }

    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ message: 'Payment introuvable' });

    payment.rawTrace = {
      at: new Date().toISOString(),
      url,
      message,
      snippet: (text || '').slice(0, 500),
      html: (html || '').slice(0, 1000),
      hasHtml: Boolean(html)
    };

    if (detectedId && !payment.transactionId) {
      payment.transactionId = detectedId;
      console.log('TransactionId détecté depuis client:', detectedId);
    }

    await payment.save();

    return res.json({ 
      ok: true, 
      detectedId: detectedId || null,
      paymentStatus: payment.status
    });
  } catch (error) {
    console.error('Erreur traceFromClient:', error);
    return res.status(500).json({ message: 'Erreur trace', error: error.message });
  }
};

/**
 * Détail admin / dashboard : id Mongo **ou** transactionId FeexPay / customId.
 */
async function findPaymentForAdminDetail(id) {
  const trimmed = String(id || '').trim();
  if (!trimmed) return null;
  if (isObjectIdLike(trimmed)) {
    const byId = await Payment.findById(trimmed).populate('achat').populate('publicite').lean();
    if (byId) return byId;
  }
  const byTxn = await Payment.findOne({ transactionId: trimmed })
    .populate('achat')
    .populate('publicite')
    .lean();
  if (byTxn) return byTxn;
  return Payment.findOne({ customId: trimmed }).populate('achat').populate('publicite').lean();
}

// Récupérer une transaction spécifique par ID
exports.getTransaction = async (req, res) => {
  try {
    const { id } = req.params;

    let payment = await findPaymentForAdminDetail(id);

    if (!payment) {
      return res.status(404).json({ message: 'Transaction non trouvée' });
    }

    // Aligner avec FeexPay V2 : si encore pending, interroger l’API distante puis mettre à jour la DB.
    if (payment.status === 'pending' && payment.transactionId) {
      try {
        const { mapped, raw, resolvedId } = await fetchFeexPayRemoteStatus(String(payment.transactionId));
        if (mapped && mapped !== payment.status) {
          const set = { status: mapped, rawStatusResponse: raw };
          if (resolvedId && String(resolvedId) !== String(payment.transactionId)) {
            set.transactionId = String(resolvedId);
          }
          await Payment.findByIdAndUpdate(payment._id, { $set: set });
          if (mapped === 'success') {
            const full = await Payment.findById(payment._id);
            if (full) await handleSuccessfulPayment(full);
          }
          payment = await findPaymentForAdminDetail(String(payment._id));
        }
      } catch (e) {
        console.warn('[getTransaction] sync FeexPay ignorée:', e.message);
      }
    }

    let userDoc = null;
    const userId = typeof payment.user === 'string' ? payment.user : null;
    if (userId && isObjectIdLike(userId)) {
      userDoc = await User.findById(userId).select('nom prenoms email').lean();
    }

    // Formater la transaction avec toutes les informations
    const transaction = {
      id: payment._id,
      paymentId: payment._id,
      transactionId: payment.transactionId,
      customId: payment.customId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      paymentMethod: payment.method || 'Bancaire',
      description: payment.description,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
      client: await resolveClientLabel(payment),
      email: userDoc?.email || null,
      provider: payment.provider || 'feexpay',
      feexpayTransactionId: payment.transactionId,
      type: getTransactionType(payment),
      duree: payment.duree || extractDurationFromDescription(payment.description),
    };

    return res.json(transaction);
  } catch (error) {
    console.error('[getTransaction] error:', error);
    return res.status(500).json({ message: 'Erreur récupération transaction', error: error.message });
  }
};

// Fonction utilitaire pour déterminer le type de transaction
function getTransactionType(payment) {
  if (payment.type === 'achat' || payment.achat) {
    return 'Achats';
  } else if (payment.type === 'publicite' || payment.publicite) {
    return 'Demande de pub';
  } else if (payment.type === 'vente') {
    return 'Vente';
  } else if (payment.type === 'verification') {
    return 'Vérification';
  } else if (payment.type === 'subscription') {
    return 'Abonnement';
  } else {
    // Fallback basé sur la description
    const desc = (payment.description || '').toLowerCase();
    if (desc.includes('pub')) {
      return 'Demande de pub';
    } else if (desc.includes('vente')) {
      return 'Vente';
    } else if (desc.includes('vérification') || desc.includes('verification')) {
      return 'Vérification';
    } else if (desc.includes('abonnement') || desc.includes('subscription')) {
      return 'Abonnement';
    }
    return 'Achats'; // Par défaut
  }
}

function normalizeTypeFilter(typeValue) {
  if (!typeValue) return null;
  const raw = String(typeValue).trim().toLowerCase();
  switch (raw) {
    case 'abonnement':
    case 'subscription':
      return 'Abonnement';
    case 'achat':
    case 'achats':
      return 'Achats';
    case 'demande de pub':
    case 'publicite':
    case 'publicité':
      return 'Demande de pub';
    case 'vente':
      return 'Vente';
    case 'verification':
    case 'vérification':
      return 'Vérification';
    default:
      return typeValue;
  }
}

exports.list = async (req, res) => {
  try {
    const { status, user, from, to, limit = 100, type, search } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (user) filter.user = user;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const uid = req.user && req.user._id ? String(req.user._id) : 'anon';
    const role = req.user && req.user.role ? String(req.user.role) : '';
    console.log(
      '[PAYMENTS_LIST] request',
      JSON.stringify({
        uid,
        role,
        filter,
        limit,
        queryKeys: Object.keys(req.query || {}),
      })
    );

    let payments = await Payment.find(filter)
      .populate('achat')
      .populate('publicite')
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 100, 500));

    const now = Date.now();
    const toSave = [];
    for (const p of payments) {
      if (p.status === 'pending') {
        const ageSec = (now - new Date(p.createdAt).getTime()) / 1000;
        if (ageSec > EXPIRE_SECONDS) {
          p.status = 'failed';
          toSave.push(p.save().catch(() => {}));
        }
      }
    }
    if (toSave.length) await Promise.allSettled(toSave);

    if (toSave.length) {
      payments = await Payment.find(filter)
        .populate('achat')
        .populate('publicite')
        .sort({ createdAt: -1 })
        .limit(Math.min(Number(limit) || 100, 500));
    }

    const transactions = await Promise.all(payments.map(async (payment) => {
      const transaction = {
        id: payment._id,
        paymentId: payment._id,
        transactionId: payment.transactionId,
        customId: payment.customId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        description: payment.description,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        client: await resolveClientLabel(payment),
        type: 'Achats',
        rawType: payment.type || null,
        duree: null,
      };

      if (payment.type === 'achat' || payment.achat) {
        transaction.type = 'Achats';
      } else if (payment.type === 'publicite' || payment.publicite) {
        transaction.type = 'Demande de pub';
        transaction.duree = payment.duree || (payment.publicite ? payment.publicite.duree : null);
      } else if (payment.type === 'vente') {
        transaction.type = 'Vente';
        transaction.duree = payment.duree || extractDurationFromDescription(payment.description);
      } else if (payment.type === 'verification') {
        transaction.type = 'Vérification';
      } else if (payment.type === 'subscription') {
        transaction.type = 'Abonnement';
      } else {
        const desc = (payment.description || '').toLowerCase();
        if (desc.includes('pub')) {
          transaction.type = 'Demande de pub';
          transaction.duree = payment.duree || extractDurationFromDescription(payment.description);
        } else if (desc.includes('vente')) {
          transaction.type = 'Vente';
          transaction.duree = payment.duree || extractDurationFromDescription(payment.description);
        } else if (desc.includes('vérification') || desc.includes('verification')) {
          transaction.type = 'Vérification';
        } else if (desc.includes('abonnement') || desc.includes('subscription')) {
          transaction.type = 'Abonnement';
        }
      }

      return transaction;
    }));

    let filteredTransactions = transactions;
    let afterTypeCount = filteredTransactions.length;
    if (type && type !== 'all') {
      const normalizedType = normalizeTypeFilter(type);
      filteredTransactions = transactions.filter(
        t =>
          t.type === normalizedType ||
          String(t.type || '').toLowerCase() === String(type).toLowerCase() ||
          String(t.rawType || '').toLowerCase() === String(type).toLowerCase()
      );
      afterTypeCount = filteredTransactions.length;
    }

    let afterSearchCount = filteredTransactions.length;
    if (search) {
      const searchLower = search.toLowerCase();
      filteredTransactions = filteredTransactions.filter(t => 
        t.client.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower) ||
        t.transactionId?.toLowerCase().includes(searchLower) ||
        t.customId?.toLowerCase().includes(searchLower)
      );
      afterSearchCount = filteredTransactions.length;
    }

    const availableTypes = [...new Set(transactions.map(t => t.type).filter(Boolean))];
    const availableStatuses = [...new Set(transactions.map(t => t.status).filter(Boolean))];
    const sampleIds = filteredTransactions.slice(0, 3).map((t) => String(t.id || t.paymentId || ''));
    console.log(
      '[PAYMENTS_LIST] response',
      JSON.stringify({
        rawPayments: payments.length,
        transactionsBuilt: transactions.length,
        afterTypeFilter: afterTypeCount,
        afterSearchFilter: afterSearchCount,
        sampleIds,
        firstStatuses: filteredTransactions.slice(0, 5).map((t) => t.status),
        firstTypes: filteredTransactions.slice(0, 5).map((t) => t.type),
      })
    );
    return res.json({
      transactions: filteredTransactions,
      total: filteredTransactions.length,
      page: 1,
      limit: Number(limit) || 100,
      availableTypes,
      availableStatuses
    });
  } catch (error) {
    console.error('[list] error:', error);
    return res.status(500).json({ message: 'Erreur liste paiements', error: error.message });
  }
};

function extractDurationFromDescription(description) {
  if (!description) return null;
  
  const patterns = [
    /(\d+)\s*(mois|month)/i,
    /(\d+)\s*(jours|days)/i,
    /(\d+)\s*(semaines|weeks)/i,
    /(\d+)\s*(ans|years)/i
  ];
  
  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const number = match[1];
      const unit = match[2].toLowerCase();
      
      if (unit.includes('mois') || unit.includes('month')) {
        return `${number} Mois`;
      } else if (unit.includes('jours') || unit.includes('days')) {
        return `${number} Jours`;
      } else if (unit.includes('semaines') || unit.includes('weeks')) {
        return `${number} Semaines`;
      } else if (unit.includes('ans') || unit.includes('years')) {
        return `${number} Ans`;
      }
    }
  }
  
  return null;
}

exports.adminSetStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const allowed = ['success', 'failed', 'cancelled', 'pending'];
    if (!allowed.includes((status || '').toLowerCase())) {
      return res.status(400).json({ message: 'Statut invalide' });
    }
    const payment = await Payment.findById(id);
    if (!payment) return res.status(404).json({ message: 'Paiement non trouvé' });
    payment.status = status.toLowerCase();
    await payment.save();
    return res.json({ ok: true, status: payment.status });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur adminSetStatus', error: error.message });
  }
};

exports.diagnoseFeexPay = async (_req, res) => {
  try {
    console.log('=== DIAGNOSTIC FEEXPAY ===');
    
    console.log('\n1. Test des credentials...');
    console.log('FEEXPAY_SHOP_ID:', FEEXPAY_SHOP_ID ? '✓ Configuré' : '✗ Manquant');
    console.log('FEEXPAY_API_TOKEN:', FEEXPAY_API_TOKEN ? '✓ Configuré' : '✗ Manquant');
    
    if (!FEEXPAY_SHOP_ID || !FEEXPAY_API_TOKEN) {
      return res.status(400).json({ 
        error: 'Credentials manquants', 
        shopId: !!FEEXPAY_SHOP_ID, 
        apiToken: !!FEEXPAY_API_TOKEN 
      });
    }

    console.log('\n2. Test création lien FeexLink...');
    try {
      const testPayload = {
        shop: FEEXPAY_SHOP_ID,
        amount: 100,
        description: 'Test diagnostic integration',
        paymentMethod: 'MOBILE',
        range: 1,
        expireIn: 5,
        mode: FEEXPAY_MODE
      };

      const initResponse = await axios.post(
        `${FEEXPAY_FEEXLINK_BASE_URL}/api/feexlink/api-create`,
        testPayload,
        {
          headers: getAuthHeaders(),
          timeout: 10000
        }
      );
      
      console.log('✓ Création lien réussie');
      console.log('Réponse:', JSON.stringify(initResponse.data, null, 2));
      
      return res.json({ 
        success: true, 
        message: 'Diagnostic complet',
        initResponse: initResponse.data
      });
      
    } catch (initError) {
      console.log('✗ Erreur création lien:', initError.response?.data || initError.message);
      return res.status(500).json({ 
        error: 'Erreur création lien',
        details: initError.response?.data || initError.message 
      });
    }
    
  } catch (error) {
    console.error('Erreur diagnostic:', error);
    return res.status(500).json({ 
      error: 'Erreur diagnostic', 
      message: error.message 
    });
  }
};

// === Background worker: auto-resolve FeexPay IDs and refresh pending statuses ===
async function resolveShortCodeIfNeeded(payment) {
  try {
    const currentId = payment.transactionId;
    if (currentId && /^[A-Za-z0-9]{8}$/.test(currentId)) {
      const realId = await getRealTransactionId(currentId);
      if (realId && realId !== currentId) {
        payment.transactionId = realId;
        await payment.save();
        console.log('🆔 transactionId résolu (worker):', realId);
        return true;
      }
    }
  } catch (e) {
    // noop
  }
  return false;
}

async function refreshPaymentStatus(payment) {
  try {
    let transactionIdToCheck = payment.transactionId;
    if (!transactionIdToCheck) return false;

    // Résoudre le shortCode en vrai ID si besoin
    if (/^[A-Za-z0-9]{8}$/.test(transactionIdToCheck)) {
      const real = await getRealTransactionId(transactionIdToCheck);
      if (real) {
        transactionIdToCheck = real;
        if (payment.transactionId !== real) {
          payment.transactionId = real;
        }
      }
    }

    const { mapped, raw, resolvedId } = await fetchFeexPayRemoteStatus(transactionIdToCheck);
    if (resolvedId && payment.transactionId !== resolvedId) {
      payment.transactionId = resolvedId;
    }
    if (mapped && mapped !== payment.status) {
      console.log('🔄 worker: mise à jour statut', payment._id, payment.status, '->', mapped);
      payment.status = mapped;
      payment.rawStatusResponse = raw;
      await payment.save();
      if (payment.status === 'success') {
        await handleSuccessfulPayment(payment);
      }
      return true;
    }
  } catch (_) {}
  return false;
}

async function pollAndUpdatePendingOnce() {
  try {
    // Prendre les paiements récents en attente pour limiter la charge
    const since = new Date(Date.now() - 1000 * 60 * 60 * 6); // 6h
    const pendings = await Payment.find({ status: 'pending', createdAt: { $gte: since } }).limit(50);
    for (const p of pendings) {
      await resolveShortCodeIfNeeded(p);
      await refreshPaymentStatus(p);
    }
  } catch (e) {
    console.error('Erreur worker paiements:', e.message);
  }
}

let workerInterval = null;
exports.startPaymentStatusWorker = function startPaymentStatusWorker() {
  if (workerInterval) return; // déjà démarré
  // Intervalle léger pour auto-actualiser
  workerInterval = setInterval(pollAndUpdatePendingOnce, 15000);
  console.log('⏱️  Worker de statut paiement démarré (15s)');
};

// Enregistrer un paiement FeexPay Flutter
exports.recordFeexPayFlutter = async (req, res) => {
  try {
    const {
      transKey,
      amount,
      description,
      type = 'verification',
      status = 'success',
      publiciteId,
      duree: bodyDuree,
      id_transaction: bodyIdTransaction,
      transactionId: bodyTransactionId,
      feexPayTransactionId,
      localRef,
      ref,
      reference: bodyReference,
    } = req.body || {};

    const feexRef =
      (bodyIdTransaction && String(bodyIdTransaction).trim()) ||
      (bodyTransactionId && String(bodyTransactionId).trim()) ||
      (feexPayTransactionId && String(feexPayTransactionId).trim()) ||
      (ref && String(ref).trim()) ||
      (bodyReference && String(bodyReference).trim()) ||
      null;
    const localTransKey =
      (transKey && String(transKey).trim()) ||
      (localRef && String(localRef).trim()) ||
      null;

    const dureeStr =
      bodyDuree != null && String(bodyDuree).trim() ? String(bodyDuree).trim() : null;

    console.log(
      '[PUB_PAYMENT][FLUTTER_RECORD][IN]',
      JSON.stringify({
        userId: req.user?._id ? String(req.user._id) : null,
        role: req.user?.role || null,
        transKey: localTransKey,
        feexRef,
        amount: Number(amount) || 0,
        type: type || null,
        status: status || null,
        publiciteId: publiciteId || null,
        duree: dureeStr,
      })
    );

    if ((!localTransKey && !feexRef) || !amount) {
      return res.status(400).json({
        message: 'Fournir amount et au moins un identifiant: transKey (réf locale) et/ou id_transaction FeexPay',
      });
    }

    const mappedStatus = mapStatus(status);
    console.log(
      '[PUB_PAYMENT][FLUTTER_RECORD][MAP]',
      JSON.stringify({ incomingStatus: status, mappedStatus })
    );
    const nowIso = new Date().toISOString();
    const orLookup = [];
    if (feexRef) orLookup.push({ transactionId: feexRef });
    if (localTransKey) {
      orLookup.push({ transactionId: localTransKey });
      orLookup.push({ 'rawInitResponse.transKey': localTransKey });
    }

    const userKeys = [];
    if (req.user?._id != null) {
      userKeys.push(req.user._id);
      userKeys.push(String(req.user._id));
    }

    const existing = await Payment.findOne({
      user: { $in: userKeys },
      method: 'FEEXPAY_FLUTTER',
      type,
      $or: orLookup,
    }).sort({ createdAt: -1 });

    const primaryStoredTransactionId = feexRef || localTransKey;

    let payment;
    let shouldReconcile = false;
    if (existing) {
      // Priorité au succès: ne jamais rétrograder success -> failed/cancelled.
      const shouldUpgradeToSuccess =
        existing.status !== 'success' && mappedStatus === 'success';
      const shouldSetNonSuccess =
        existing.status !== 'success' && mappedStatus !== 'success';

      if (shouldUpgradeToSuccess || shouldSetNonSuccess) {
        existing.status = mappedStatus;
      }
      shouldReconcile = shouldUpgradeToSuccess;
      existing.amount = Number(amount) || existing.amount;
      existing.description = description || existing.description;
      if (dureeStr) {
        existing.duree = dureeStr;
      }
      if (feexRef && existing.transactionId !== feexRef) {
        existing.transactionId = feexRef;
      }
      existing.rawInitResponse = {
        ...(existing.rawInitResponse || {}),
        source: 'feexpay_flutter',
        transKey: localTransKey || existing.rawInitResponse?.transKey || null,
        feexTransactionId: feexRef || existing.rawInitResponse?.feexTransactionId || null,
        recordedAt: nowIso,
        incomingStatus: mappedStatus,
      };
      await existing.save();
      payment = existing;
      console.log(
        'Paiement FeexPay Flutter mis à jour:',
        payment._id,
        'status=',
        payment.status,
      );
    } else {
      const customId = `${type.toUpperCase()}_${req.user?._id}_${Date.now()}`;
      payment = await Payment.create({
        provider: 'feexpay',
        transactionId: primaryStoredTransactionId,
        customId,
        publicite: publiciteId || undefined,
        user: req.user?._id != null ? String(req.user._id) : undefined,
        amount: Number(amount),
        currency: 'XOF',
        status: mappedStatus,
        method: 'FEEXPAY_FLUTTER',
        description,
        type,
        duree: dureeStr || undefined,
        rawInitResponse: {
          source: 'feexpay_flutter',
          transKey: localTransKey,
          feexTransactionId: feexRef,
          recordedAt: nowIso,
          incomingStatus: mappedStatus,
        },
      });
      shouldReconcile = mappedStatus === 'success';
      console.log(
        'Paiement FeexPay Flutter enregistré:',
        payment._id,
        'status=',
        payment.status,
      );
    }

    if (shouldReconcile && payment.status === 'success') {
      console.log(
        '[PUB_PAYMENT][FLUTTER_RECORD][RECONCILE_SUCCESS]',
        JSON.stringify({
          paymentId: String(payment._id),
          type: payment.type,
          publicite: payment.publicite ? String(payment.publicite) : null,
          user: payment.user ? String(payment.user) : null,
        })
      );
      await handleSuccessfulPayment(payment);
    }

    return res.json({
      ok: true,
      paymentId: payment._id,
      transactionId: payment.transactionId,
      status: payment.status
    });
  } catch (error) {
    console.error('[recordFeexPayFlutter] error:', error);
    return res.status(500).json({ 
      message: 'Erreur enregistrement paiement', 
      error: error.message 
    });
  }
};
