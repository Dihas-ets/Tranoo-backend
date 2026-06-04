const mongoose = require('mongoose');
const Payment = require('../models/Payment');
const Article = require('../models/Article');

function extractArticleIdFromTransKey(transKey) {
  const m = String(transKey || '').match(/VERIFICATION_([a-f0-9]{24})_/i);
  return m?.[1] || null;
}

/**
 * Après paiement FeexPay : confirme la demande de vérification (paiement déjà enregistré via /payments/feexpay/flutter/record).
 */
exports.requestVerification = async (req, res) => {
  try {
    const { articleId, transKey, amount } = req.body || {};
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentification requise' });
    }

    const articleIdFromKey = extractArticleIdFromTransKey(transKey);
    const resolvedArticleId = articleId || articleIdFromKey;

    if (!resolvedArticleId || !mongoose.Types.ObjectId.isValid(resolvedArticleId)) {
      return res.status(400).json({
        success: false,
        message: 'articleId invalide ou manquant',
      });
    }

    const article = await Article.findById(resolvedArticleId).select('_id titre type');
    if (!article) {
      return res.status(404).json({ success: false, message: 'Article introuvable' });
    }

    const userKeys = [userId, String(userId)];
    const orLookup = [
      {
        status: 'success',
        type: 'verification',
        user: { $in: userKeys },
        customId: new RegExp(`VERIFICATION_${resolvedArticleId}`, 'i'),
      },
    ];
    if (transKey) {
      orLookup.push({
        status: 'success',
        type: 'verification',
        user: { $in: userKeys },
        customId: String(transKey).trim(),
      });
      orLookup.push({
        status: 'success',
        type: 'verification',
        user: { $in: userKeys },
        'rawInitResponse.transKey': String(transKey).trim(),
      });
    }

    let payment = await Payment.findOne({ $or: orLookup }).sort({ createdAt: -1 });

    if (!payment && transKey) {
      payment = await Payment.findOne({
        user: { $in: userKeys },
        type: 'verification',
        $or: [
          { customId: String(transKey).trim() },
          { transactionId: String(transKey).trim() },
        ],
      }).sort({ createdAt: -1 });
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message:
          'Paiement de vérification introuvable. Attendez quelques secondes et réessayez, ou contactez le support.',
      });
    }

    if (payment.status !== 'success') {
      return res.status(400).json({
        success: false,
        message: 'Le paiement n\'est pas encore confirmé',
        paymentId: String(payment._id),
        status: payment.status,
      });
    }

    const expectedCustomId =
      transKey && String(transKey).startsWith('VERIFICATION_')
        ? String(transKey).trim()
        : `VERIFICATION_${resolvedArticleId}_${Date.now()}`;

    if (!payment.customId || !String(payment.customId).includes(resolvedArticleId)) {
      payment.customId = expectedCustomId;
    }
    payment.description =
      payment.description || `Frais vérification — ${article.titre || 'véhicule'}`;
    if (amount != null && Number(amount) > 0) {
      payment.amount = Number(amount);
    }
    await payment.save();

    console.log('[VERIFICATION][REQUEST] OK', {
      paymentId: String(payment._id),
      articleId: String(resolvedArticleId),
      userId: String(userId),
    });

    return res.status(200).json({
      success: true,
      message: 'Demande de vérification enregistrée',
      paymentId: String(payment._id),
      articleId: String(resolvedArticleId),
      transactionId: payment.transactionId || null,
    });
  } catch (error) {
    console.error('[VERIFICATION][REQUEST] error:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement de la demande',
      error: error.message,
    });
  }
};
