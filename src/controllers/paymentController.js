// const axios = require('axios');
// const Payment = require('../models/Payment');
// const Achat = require('../models/Achat');
// const Article = require('../models/Article');

// const FEEXPAY_BASE_URL = process.env.FEEXPAY_BASE_URL || 'https://api.feexpay.me';
// const FEEXPAY_SHOP_ID = process.env.FEEXPAY_SHOP_ID || '';
// const FEEXPAY_API_TOKEN = process.env.FEEXPAY_API_TOKEN || '';
// const FEEXPAY_MODE = process.env.FEEXPAY_MODE || 'SANDBOX';

// function getAuthHeaders() {
//   return {
//     'Content-Type': 'application/json',
//     'Authorization': `Bearer ${FEEXPAY_API_TOKEN}`,
//     'X-Shop-ID': FEEXPAY_SHOP_ID,
//     'User-Agent': 'TranooAPI/1.0',
//   };
// }

// exports.initPayment = async (req, res) => {
//   try {
//     const { amount, description, customId, achatId, currency = 'XOF', method } = req.body;
//     if (!amount || !customId) {
//       return res.status(400).json({ message: 'amount et customId requis' });
//     }

//     const achat = achatId ? await Achat.findById(achatId) : null;

//     const payload = {
//       amount,
//       custom_id: customId,
//       description,
//       callback_url: process.env.FEEXPAY_SUCCESS_URL || 'https://tranoo.com/payment/success',
//       error_callback_url: process.env.FEEXPAY_ERROR_URL || 'https://tranoo.com/payment/error',
//       case: method,
//       mode: FEEXPAY_MODE,
//       currency,
//     };

//     const fpRes = await axios.post(`${FEEXPAY_BASE_URL}/payment/init`, payload, { headers: getAuthHeaders(), timeout: 30000 });

//     const data = fpRes.data || {};
//     const payment = await Payment.create({
//       provider: 'feexpay',
//       transactionId: data.transaction_id,
//       customId,
//       achat: achat ? achat._id : undefined,
//       user: req.user?._id || undefined,
//       amount,
//       currency,
//       status: 'pending',
//       method,
//       description,
//       rawInitResponse: data,
//     });

//     return res.json({ paymentUrl: data.payment_url, transactionId: data.transaction_id, paymentId: payment._id });
//   } catch (error) {
//     console.error('[initPayment] error:', error.response?.data || error.message);
//     return res.status(500).json({ message: 'Erreur initialisation paiement', error: error.response?.data || error.message });
//   }
// };

// exports.webhook = async (req, res) => {
//   try {
//     // TODO: vérifier signature selon la doc FeexPay (si fournie)
//     const payload = req.body;
//     const { transaction_id, status, amount, custom_id } = payload;

//     const payment = await Payment.findOne({ transactionId: transaction_id });
//     if (!payment) {
//       // Fallback sur customId
//       await Payment.create({
//         provider: 'feexpay',
//         transactionId: transaction_id,
//         customId: custom_id,
//         amount,
//         status: mapStatus(status),
//         rawWebhookPayload: payload,
//       });
//       return res.json({ ok: true });
//     }

//     payment.status = mapStatus(status);
//     payment.rawWebhookPayload = payload;
//     await payment.save();

//     // Si success: réconcilier avec l'achat et marquer l'article vendu si applicable
//     if (payment.status === 'success' && payment.achat) {
//       try {
//         const achat = await Achat.findById(payment.achat);
//         if (achat && achat.article) {
//           const article = await Article.findById(achat.article);
//           if (article && article.statutVente !== 'vendu') {
//             article.statutVente = 'vendu';
//             if (!article.dateAchat) article.dateAchat = new Date();
//             await article.save();
//           }
//         }
//       } catch (e) {
//         console.error('[webhook] reconciliation error:', e);
//       }
//     }

//     return res.json({ ok: true });
//   } catch (error) {
//     console.error('[webhook] error:', error);
//     return res.status(500).json({ message: 'Erreur webhook', error: error.message });
//   }
// };

// exports.getStatus = async (req, res) => {
//   try {
//     const { id } = req.params; // paymentId or transactionId
//     let payment = await Payment.findById(id);
//     if (!payment) {
//       payment = await Payment.findOne({ transactionId: id });
//     }
//     if (!payment) return res.status(404).json({ message: 'Paiement non trouvé' });

//     // Si en attente, interroger FeexPay pour rafraîchir l'état (polling côté serveur)
//     if (payment.status === 'pending' && payment.transactionId) {
//       try {
//         const fp = await axios.get(
//           `${FEEXPAY_BASE_URL}/transaction/${payment.transactionId}/status`,
//           { headers: getAuthHeaders(), timeout: 15000 }
//         );
//         const fpStatus = fp.data?.status || fp.data?.state || fp.data?.result;
//         const mapped = mapStatus(fpStatus);
//         if (mapped !== payment.status) {
//           payment.status = mapped;
//           await payment.save();
//         }
//       } catch (e) {
//         // Ne pas casser la réponse si l'appel échoue; retourner l'état connu
//         console.error('[getStatus] refresh error:', e.response?.data || e.message);
//       }
//     }

//     return res.json({ status: payment.status, payment });
//   } catch (error) {
//     return res.status(500).json({ message: 'Erreur récupération statut', error: error.message });
//   }
// };

// function mapStatus(fpStatus) {
//   switch ((fpStatus || '').toString().toLowerCase()) {
//     case 'success':
//     case 'paid':
//       return 'success';
//     case 'failed':
//     case 'error':
//       return 'failed';
//     case 'cancelled':
//     case 'canceled':
//       return 'cancelled';
//     default:
//       return 'pending';
//   }
// }





const axios = require('axios');
const Payment = require('../models/Payment');
const Achat = require('../models/Achat');
const Article = require('../models/Article');

const FEEXPAY_BASE_URL = process.env.FEEXPAY_BASE_URL || 'https://api.feexpay.me';
// FeexLink init + Public transaction status (d'après doc FeexPay)
const FP_INIT_PATH = process.env.FEEXPAY_INIT_PATH || '/api/feexlink/api-create';
const FP_STATUS_PATH_TMPL = process.env.FEEXPAY_STATUS_PATH || '/api/transaction/:id/status';
const FP_STATUS_PUBLIC_PATH_TMPL = process.env.FEEXPAY_STATUS_PUBLIC_PATH || '/api/transactions/public/single/status/:id';
const FEEXPAY_SHOP_ID = process.env.FEEXPAY_SHOP_ID || '';
const FEEXPAY_API_TOKEN = process.env.FEEXPAY_API_TOKEN || '';
const FEEXPAY_MODE = process.env.FEEXPAY_MODE || 'SANDBOX';
const FEEXPAY_SUCCESS_URL = process.env.FEEXPAY_SUCCESS_URL || 'https://tranoo.com/payment/success';
const FEEXPAY_ERROR_URL = process.env.FEEXPAY_ERROR_URL || 'https://tranoo.com/payment/error';

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${FEEXPAY_API_TOKEN}`,
    'X-Shop-ID': FEEXPAY_SHOP_ID,
    'User-Agent': 'TranooAPI/1.0',
  };
}

exports.initPayment = async (req, res) => {
  try {
    const { amount, description, customId, achatId, currency = 'XOF', method } = req.body;
    if (!amount || !customId) {
      return res.status(400).json({ message: 'amount et customId requis' });
    }

    const achat = achatId ? await Achat.findById(achatId) : null;

    // FeexLink init payload (cf. doc): shop, amount, description, paymentMethod, range, expireIn
    const payload = {
      shop: FEEXPAY_SHOP_ID,
      amount,
      description: description || 'Tranoo paiement',
      paymentMethod: method && typeof method === 'string' ? method.toUpperCase() : 'MOBILE',
      range: 1,
      expireIn: 10,
      callback_url: FEEXPAY_SUCCESS_URL,
      error_callback_url: FEEXPAY_ERROR_URL,
      mode: FEEXPAY_MODE,
    };

    const initUrl = `${FEEXPAY_BASE_URL.replace(/\/$/, '')}${FP_INIT_PATH.startsWith('/') ? '' : '/'}${FP_INIT_PATH}`;
    const fpRes = await axios.post(initUrl, payload, { headers: getAuthHeaders(), timeout: 30000 });

    const data = fpRes.data || {};
    const paymentUrl = data.urlPay || data.payment_url || data.url || null;
    if (!paymentUrl) {
      return res.status(502).json({ message: 'Réponse inattendue de FeexPay (pas de payment URL)', data });
    }

    const payment = await Payment.create({
      provider: 'feexpay',
      // transactionId inconnu à l'init FeexLink; récupérable via redirection (id_transaction)
      transactionId: null,
      customId,
      achat: achat ? achat._id : undefined,
      user: req.user?._id,
      amount,
      currency,
      status: 'pending',
      method,
      description,
      rawInitResponse: data,
    });

    return res.json({ paymentUrl, transactionId: null, paymentId: payment._id });
  } catch (error) {
    console.error('[initPayment] error:', error.response?.data || error.message);
    return res.status(500).json({ message: 'Erreur initialisation paiement', error: error.response?.data || error.message });
  }
};

function mapStatus(fpStatus) {
  switch ((fpStatus || '').toString().toLowerCase()) {
    case 'success':
    case 'paid':
      return 'success';
    case 'failed':
    case 'error':
      return 'failed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

exports.webhook = async (req, res) => {
  try {
    const payload = req.body;
    const { transaction_id, status, amount, custom_id } = payload;

    let payment = await Payment.findOne({ transactionId: transaction_id });

    if (!payment) {
      payment = await Payment.create({
        provider: 'feexpay',
        transactionId: transaction_id,
        customId: custom_id,
        amount,
        status: mapStatus(status),
        rawWebhookPayload: payload,
      });
      return res.json({ ok: true });
    }

    payment.status = mapStatus(status);
    payment.rawWebhookPayload = payload;
    await payment.save();

    if (payment.status === 'success' && payment.achat) {
      try {
        const achat = await Achat.findById(payment.achat);
        if (achat && achat.article) {
          const article = await Article.findById(achat.article);
          if (article && article.statutVente !== 'vendu') {
            article.statutVente = 'vendu';
            if (!article.dateAchat) article.dateAchat = new Date();
            await article.save();
          }
        }
      } catch (e) {
        console.error('[webhook] reconciliation error:', e);
      }
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('[webhook] error:', error);
    return res.status(500).json({ message: 'Erreur webhook', error: error.message });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const { id } = req.params; // paymentId ou transactionId
    let payment = await Payment.findById(id);
    if (!payment) {
      payment = await Payment.findOne({ transactionId: id });
    }
    if (!payment) return res.status(404).json({ message: 'Paiement non trouvé' });

    // Polling côté serveur si le paiement est en attente
    if (payment.status === 'pending' && payment.transactionId) {
      try {
        const statusPath = FP_STATUS_PATH_TMPL.replace(':id', encodeURIComponent(payment.transactionId));
        const statusUrl = `${FEEXPAY_BASE_URL.replace(/\/$/, '')}${statusPath.startsWith('/') ? '' : '/'}${statusPath}`;
        const fp = await axios.get(statusUrl, { headers: getAuthHeaders(), timeout: 15000 });
        const fpStatus = fp.data?.status || fp.data?.state || fp.data?.result;
        const mapped = mapStatus(fpStatus);
        if (mapped !== payment.status) {
          payment.status = mapped;
          await payment.save();
        }
      } catch (e) {
        console.error('[getStatus] refresh error:', e.response?.data || e.message);
      }
    }

    return res.json({ status: payment.status, payment });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur récupération statut', error: error.message });
  }
};

// Statut public FeexPay (id_transaction depuis la redirection)
exports.getPublicStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ message: 'id requis' });
    const statusPath = FP_STATUS_PUBLIC_PATH_TMPL.replace(':id', encodeURIComponent(id));
    const statusUrl = `${FEEXPAY_BASE_URL.replace(/\/$/, '')}${statusPath.startsWith('/') ? '' : '/'}${statusPath}`;
    const fp = await axios.get(statusUrl, { headers: getAuthHeaders(), timeout: 15000 });
    const fpStatus = fp.data?.status || fp.data?.state || fp.data?.result;
    const mapped = mapStatus(fpStatus);
    return res.json({ status: mapped, raw: fp.data });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur statut public', error: error.response?.data || error.message });
  }
};
