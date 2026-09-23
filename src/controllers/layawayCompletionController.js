const LayawayPayoutService = require('../services/layaway/LayawayPayoutService');
const LayawayClosureService = require('../services/layaway/LayawayClosureService');

function sendCompletionError(res, error) {
  const codeStatus = {
    LAYAWAY_NOT_FOUND: 404,
    LAYAWAY_FORBIDDEN: 403,
    LAYAWAY_PAYOUT_BLOCKED: 409,
    LAYAWAY_PAYOUT_ALREADY_PAID: 409,
    LAYAWAY_ALREADY_CLOSED: 409,
    LAYAWAY_CLOSE_FORBIDDEN: 409,
    LAYAWAY_CLOSE_DELIVERY_REQUIRED: 409,
    LAYAWAY_TRANSITION_FORBIDDEN: 409,
  };
  const status = error.status || codeStatus[error.code] || 500;
  const payload = {
    success: false,
    message: error.message || 'Erreur clôture / payout Layaway',
  };
  if (error.code) payload.code = error.code;
  if (error.meta) payload.meta = error.meta;
  if (status >= 500) console.error('[layaway-completion] error:', error);
  return res.status(status).json(payload);
}

function isAdminUser(user) {
  return Boolean(user?.role === 'admin' || user?.typeAdmin);
}

/** GET /api/layaway/admin/dossiers/:id/payout */
exports.getPayout = async (req, res) => {
  try {
    const result = await LayawayPayoutService.getPayout(req.params.id);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendCompletionError(res, error);
  }
};

/**
 * POST /api/layaway/admin/dossiers/:id/payout/mark-paid
 * Body: { reference?, notes?, amount? }
 */
exports.markPayoutPaid = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await LayawayPayoutService.markPayoutPaid(
      req.params.id,
      req.user._id,
      {
        reference: body.reference,
        notes: body.notes,
        amount: body.amount,
      },
    );
    return res.status(200).json({
      success: true,
      message: 'Payout vendeur marqué comme versé',
      ...result,
    });
  } catch (error) {
    return sendCompletionError(res, error);
  }
};

/**
 * POST /api/layaway/admin/dossiers/:id/close
 * Body: { notes? } — émet facture + CLOTURE
 */
exports.closeDossier = async (req, res) => {
  try {
    const result = await LayawayClosureService.closeDossier(
      req.params.id,
      req.user._id,
      { notes: req.body?.notes },
    );
    return res.status(200).json({
      success: true,
      message: 'Dossier clôturé — facture émise',
      ...result,
    });
  } catch (error) {
    return sendCompletionError(res, error);
  }
};

/** GET /api/layaway/dossiers/:id/invoice */
exports.getInvoice = async (req, res) => {
  try {
    const result = await LayawayClosureService.getInvoice(req.params.id, {
      buyerId: req.user._id,
      isAdmin: isAdminUser(req.user),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendCompletionError(res, error);
  }
};
