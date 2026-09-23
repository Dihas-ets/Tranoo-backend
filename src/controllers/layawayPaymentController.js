const LayawayPaymentService = require('../services/layaway/LayawayPaymentService');

function sendPayError(res, error) {
  const codeStatus = {
    LAYAWAY_NOT_FOUND: 404,
    LAYAWAY_FORBIDDEN: 403,
    LAYAWAY_FROZEN: 409,
    LAYAWAY_ALREADY_PAID: 409,
    LAYAWAY_PAYMENT_FORBIDDEN: 409,
    LAYAWAY_CONTRACT_NOT_SIGNED: 409,
    LAYAWAY_NOTHING_TO_PAY: 409,
    LAYAWAY_AMOUNT_BELOW_MINIMUM: 400,
    LAYAWAY_AMOUNT_ABOVE_MAXIMUM: 400,
    LAYAWAY_INVALID_AMOUNT: 400,
  };
  const status = error.status || codeStatus[error.code] || 500;
  const payload = {
    success: false,
    message: error.message || 'Erreur paiement Layaway',
  };
  if (error.code) payload.code = error.code;
  if (error.meta) payload.meta = error.meta;
  if (status >= 500) console.error('[layaway-payment] error:', error);
  return res.status(status).json(payload);
}

/**
 * GET /api/layaway/dossiers/:id/payments/quote?amount=
 * Montant optionnel : si fourni, doit être >= minimum (surplus OK).
 */
exports.quotePayment = async (req, res) => {
  try {
    const quote = await LayawayPaymentService.quotePayment(
      req.params.id,
      req.user._id,
      req.query.amount ?? req.body?.amount,
    );
    return res.status(200).json({ success: true, quote });
  } catch (error) {
    return sendPayError(res, error);
  }
};

/**
 * POST /api/layaway/dossiers/:id/payments
 * Body: { amount? } — omis = minimum ; >= minimum accepté (surplus → échéances suivantes)
 * Crée un Payment pending (intent). Ensuite RTP FeexPay avec customId + amount retournés.
 */
exports.createPaymentIntent = async (req, res) => {
  try {
    const { payment, quote } = await LayawayPaymentService.createPaymentIntent(
      req.params.id,
      req.user._id,
      {
        amount: req.body?.amount,
        method: req.body?.method,
      },
    );
    return res.status(201).json({
      success: true,
      message:
        'Intent créé. Utilisez customId + amount avec /api/payments/feexpay/requesttopay/:network',
      payment: {
        id: payment._id,
        customId: payment.customId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        type: payment.type,
        layawayKind: payment.layawayKind,
        layawayGuaranteeAmount: payment.layawayGuaranteeAmount,
        layawayInstallmentAmount: payment.layawayInstallmentAmount,
      },
      quote,
    });
  } catch (error) {
    return sendPayError(res, error);
  }
};

/** GET /api/layaway/dossiers/:id/payments */
exports.listPayments = async (req, res) => {
  try {
    const payments = await LayawayPaymentService.listPayments(
      req.params.id,
      req.user._id,
    );
    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    return sendPayError(res, error);
  }
};
