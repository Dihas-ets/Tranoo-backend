const axios = require('axios');
const Payment = require('../models/Payment');
const Achat = require('../models/Achat');
const Article = require('../models/Article');
const Publicite = require('../models/Publicite');
const User = require('../models/User');
const Referral = require('../models/Referral');
const AgentEarning = require('../models/AgentEarning');

const FEEXPAY_BASE_URL = process.env.FEEXPAY_BASE_URL || 'https://api.feexpay.me';
const FEEXPAY_SHOP_ID = process.env.FEEXPAY_SHOP_ID || '';
const FEEXPAY_API_TOKEN = process.env.FEEXPAY_API_TOKEN || '';
const FEEXPAY_MODE = process.env.FEEXPAY_MODE || 'SANDBOX';
const FEEXLINK_DISABLED = String(process.env.FEEXLINK_DISABLED || 'true').toLowerCase() === 'true';
const EXPIRE_SECONDS = Number(process.env.PAYMENT_EXPIRE_SECONDS || 900);
const FEEXPAY_DISABLE_LOCAL_EXPIRY = String(process.env.FEEXPAY_DISABLE_LOCAL_EXPIRY || 'true').toLowerCase() === 'true';

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${FEEXPAY_API_TOKEN}`,
    'X-Shop-ID': FEEXPAY_SHOP_ID,
    'User-Agent': 'TranooAPI/1.0',
  };
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
    const listUrl = `https://api.feexpay.me/api/transactions?page=1&limit=50`;
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

    const initUrl = `${FEEXPAY_BASE_URL}/api/feexlink/api-create`;
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
  switch ((fpStatus || '').toString().toLowerCase()) {
    case 'success':
    case 'successful':
    case 'paid':
    case 'completed':
      return 'success';
    case 'failed':
    case 'error':
    case 'declined':
      return 'failed';
    case 'processing':
    case 'authorized':
    case 'waiting':
    case 'cancelled':
    case 'canceled':
    case 'expired':
      return 'cancelled';
    case 'pending':
    case 'in pending state':
      return 'pending';
    default:
      return 'pending';
  }
}

exports.webhook = async (req, res) => {
  try {
    console.log('Webhook FeexPay reçu:', JSON.stringify(req.body, null, 2));
    
    const payload = req.body;
    const { transaction_id, id_transaction, status, amount, custom_id, short_code } = payload;
    
    const actualTransactionId = transaction_id || id_transaction || short_code;
    
    if (!actualTransactionId) {
      console.error('Webhook sans identifiant de transaction');
      return res.status(400).json({ error: 'Identifiant de transaction manquant' });
    }

    let payment = await Payment.findOne({ 
      $or: [
        { transactionId: actualTransactionId },
        { customId: custom_id }
      ]
    });

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
        publicite.statutPaiement = 'payé';
        publicite.datePaiement = new Date();
        await publicite.save();
        console.log('Publicité marquée comme payée:', publicite._id);
      }
    }

    // Commissions 10% pour l'agent commercial si l'utilisateur payeur a été parrainé par un agent
    if (payment.user) {
      try {
        const payer = await User.findById(payment.user);
        if (payer && (payer.role === 'vendeur' || payer.role === 'transitaire')) {
          const referral = await Referral.findOne({ referredId: payer._id, status: 'completed' }).populate('referrerId');
          if (referral && referral.referrerId && referral.referrerId.role === 'agentCommercial') {
            const commission = Math.round((Number(payment.amount) || 0) * 0.10);
            if (commission > 0) {
              await AgentEarning.create({
                agent: referral.referrerId._id,
                type: payment.type === 'subscription' ? 'commission_subscription' : 'commission_publicite',
                amount: commission,
                sourcePayment: payment._id,
                referredUser: payer._id,
              });
              console.log('Commission agent créée:', commission, 'XOF');
            }
          }
        }
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
        let transactionIdToCheck = payment.transactionId;
        
        // Détecter si c'est un code court (8 caractères alphanumériques)
        if (transactionIdToCheck && transactionIdToCheck.length === 8 && /^[A-Za-z0-9]{8}$/.test(transactionIdToCheck)) {
          console.log('Détection code court, recherche du vrai transactionId...');
          
          const realTransactionId = await getRealTransactionId(transactionIdToCheck);
          if (realTransactionId) {
            transactionIdToCheck = realTransactionId;
            payment.transactionId = realTransactionId;
            await payment.save();
            console.log('✅ TransactionId mis à jour:', realTransactionId);
          } else {
            console.log('❌ Impossible de trouver le vrai transactionId, utilisation du code court');
          }
        }
        
        if (transactionIdToCheck) {
          const statusUrl = `https://api.feexpay.me/api/transactions/public/single/status/${transactionIdToCheck}`;
          console.log('Interrogation statut FeexPay:', statusUrl);
          
          const fp = await axios.get(statusUrl, { 
            headers: getAuthHeaders(), 
            timeout: 10000 
          });
          
          console.log('✅ Réponse statut FeexPay:', JSON.stringify(fp.data, null, 2));
          
          const fpStatus = fp.data?.status || fp.data?.state || fp.data?.result;
          const mapped = mapStatus(fpStatus);
          
          if (mapped !== payment.status) {
            console.log('Mise à jour statut:', payment.status, '->', mapped);
            payment.status = mapped;
            payment.rawStatusResponse = fp.data;
            await payment.save();
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
    
    // Vérifier si c'est un code court ou un UUID
    let transactionIdToUse = id;
    let isShortCode = false;
    
    if (id.length === 8 && /^[A-Za-z0-9]{8}$/.test(id)) {
      isShortCode = true;
      console.log('Code court détecté, recherche du vrai transactionId...');
      
      const realTransactionId = await getRealTransactionId(id);
      if (realTransactionId) {
        transactionIdToUse = realTransactionId;
        console.log('✅ Vrai transactionId trouvé:', realTransactionId);
      } else {
        console.log('❌ Utilisation du code court car vrai ID non trouvé');
      }
    }
    
    const statusUrl = `https://api.feexpay.me/api/transactions/public/single/status/${transactionIdToUse}`;
    console.log('Interrogation statut public:', statusUrl);
    
    const fp = await axios.get(statusUrl, { 
      headers: getAuthHeaders(), 
      timeout: 10000 
    });
    
    const fpStatus = fp.data?.status || fp.data?.state || fp.data?.result;
    const mapped = mapStatus(fpStatus);
    
    console.log('Statut public pour', transactionIdToUse, ':', mapped);
    
    if (paymentId) {
      try {
        const payment = await Payment.findById(paymentId);
        if (payment) {
          // Mettre à jour avec le vrai transactionId si on l'a trouvé
          if (isShortCode && transactionIdToUse !== id) {
            payment.transactionId = transactionIdToUse;
            console.log('✅ TransactionId mis à jour dans la base:', transactionIdToUse);
          }
          
          if (payment.status !== mapped) {
            console.log('Mise à jour statut depuis public:', payment.status, '->', mapped);
            payment.status = mapped;
          }
          payment.rawStatusResponse = fp.data;
          await payment.save();
        }
      } catch (e) {
        console.error('Erreur mise à jour paiement:', e.message);
      }
    }
    
    return res.json({ 
      status: mapped, 
      id_transaction: transactionIdToUse,
      is_short_code: isShortCode,
      raw: fp.data 
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

// Récupérer une transaction spécifique par ID
exports.getTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    
    const payment = await Payment.findById(id)
      .populate('achat')
      .populate('publicite')
      .populate('user', 'nom prenoms email');
    
    if (!payment) {
      return res.status(404).json({ message: 'Transaction non trouvée' });
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
      client: payment.user ? `${payment.user.nom || ''} ${payment.user.prenoms || ''}`.trim() : 'Client inconnu',
      email: payment.user?.email || null,
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
    if (payment.description && payment.description.includes('pub')) {
      return 'Demande de pub';
    } else if (payment.description && payment.description.includes('vente')) {
      return 'Vente';
    } else if (payment.description && payment.description.includes('vérification')) {
      return 'Vérification';
    } else if (payment.description && payment.description.includes('abonnement')) {
      return 'Abonnement';
    }
    return 'Achats'; // Par défaut
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

    let payments = await Payment.find(filter)
      .populate('achat')
      .populate('publicite')
      .populate('user', 'nom prenoms email')
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
        .populate('user', 'nom prenoms email')
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
        client: payment.user ? `${payment.user.nom || ''} ${payment.user.prenoms || ''}`.trim() : 'Client inconnu',
        type: 'Achats',
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
        if (payment.description && payment.description.includes('pub')) {
          transaction.type = 'Demande de pub';
          transaction.duree = payment.duree || extractDurationFromDescription(payment.description);
        } else if (payment.description && payment.description.includes('vente')) {
          transaction.type = 'Vente';
          transaction.duree = payment.duree || extractDurationFromDescription(payment.description);
        } else if (payment.description && payment.description.includes('vérification')) {
          transaction.type = 'Vérification';
        } else if (payment.description && payment.description.includes('abonnement')) {
          transaction.type = 'Abonnement';
        }
      }

      return transaction;
    }));

    let filteredTransactions = transactions;
    if (type && type !== 'all') {
      filteredTransactions = transactions.filter(t => t.type === type);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filteredTransactions = filteredTransactions.filter(t => 
        t.client.toLowerCase().includes(searchLower) ||
        t.description?.toLowerCase().includes(searchLower) ||
        t.transactionId?.toLowerCase().includes(searchLower) ||
        t.customId?.toLowerCase().includes(searchLower)
      );
    }

    return res.json({
      transactions: filteredTransactions,
      total: filteredTransactions.length,
      page: 1,
      limit: Number(limit) || 100
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
        'https://api.feexpay.me/api/feexlink/api-create',
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

    const statusUrl = `https://api.feexpay.me/api/transactions/public/single/status/${transactionIdToCheck}`;
    const fp = await axios.get(statusUrl, { headers: getAuthHeaders(), timeout: 10000 });
    const fpStatus = fp.data?.status || fp.data?.state || fp.data?.result;
    const mapped = mapStatus(fpStatus);
    if (mapped && mapped !== payment.status) {
      console.log('🔄 worker: mise à jour statut', payment._id, payment.status, '->', mapped);
      payment.status = mapped;
      payment.rawStatusResponse = fp.data;
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
      status = 'success'
    } = req.body || {};

    if (!transKey || !amount) {
      return res.status(400).json({ message: 'transKey et amount requis' });
    }

    const customId = `${type.toUpperCase()}_${req.user?._id}_${Date.now()}`;

    const payment = await Payment.create({
      provider: 'feexpay',
      transactionId: transKey,
      customId,
      user: req.user?._id,
      amount: Number(amount),
      currency: 'XOF',
      status: mapStatus(status),
      method: 'FEEXPAY_FLUTTER',
      description,
      type,
      rawInitResponse: {
        source: 'feexpay_flutter',
        transKey,
        recordedAt: new Date().toISOString()
      },
    });

    console.log('Paiement FeexPay Flutter enregistré:', payment._id);

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