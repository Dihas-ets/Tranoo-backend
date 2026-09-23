const LayawayCancellationService = require('../services/layaway/LayawayCancellationService');

function sendCancelError(res, error) {
  const codeStatus = {
    LAYAWAY_NOT_FOUND: 404,
    LAYAWAY_FORBIDDEN: 403,
    LAYAWAY_CANCEL_FORBIDDEN: 409,
    LAYAWAY_CANCEL_ALREADY_REQUESTED: 409,
    LAYAWAY_CANCEL_REASON_REQUIRED: 400,
    LAYAWAY_REFUND_MODE_REQUIRED: 400,
    LAYAWAY_REFUND_MODE_INVALID: 400,
    LAYAWAY_REFUND_BANK_REQUIRED: 400,
    LAYAWAY_REFUND_CHECK_REQUIRED: 400,
    LAYAWAY_CANCEL_APPROVE_FORBIDDEN: 409,
    LAYAWAY_CANCEL_REJECT_FORBIDDEN: 409,
    LAYAWAY_CANCEL_REJECT_REASON_REQUIRED: 400,
    LAYAWAY_CANCEL_RESTORE_FORBIDDEN: 409,
    LAYAWAY_REFUND_EXECUTE_FORBIDDEN: 409,
    LAYAWAY_TRANSITION_FORBIDDEN: 409,
  };
  const status = error.status || codeStatus[error.code] || 500;
  const payload = {
    success: false,
    message: error.message || 'Erreur annulation Layaway',
  };
  if (error.code) payload.code = error.code;
  if (error.meta) payload.meta = error.meta;
  if (status >= 500) console.error('[layaway-cancel] error:', error);
  return res.status(status).json(payload);
}

function isAdminUser(user) {
  return Boolean(user?.role === 'admin' || user?.typeAdmin);
}

/** GET /api/layaway/dossiers/:id/cancellation */
exports.getCancellation = async (req, res) => {
  try {
    const result = await LayawayCancellationService.getCancellation(req.params.id, {
      buyerId: req.user._id,
      isAdmin: isAdminUser(req.user),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendCancelError(res, error);
  }
};

/**
 * POST /api/layaway/dossiers/:id/cancellation
 * Body: { reason, refundMode?, bankDetails?, checkDetails? }
 */
exports.requestCancellation = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await LayawayCancellationService.requestCancellation(
      req.params.id,
      req.user._id,
      {
        reason: body.reason || body.motif,
        refundMode: body.refundMode || body.mode,
        bankDetails: body.bankDetails,
        checkDetails: body.checkDetails,
      },
    );
    return res.status(200).json({
      success: true,
      message: 'Demande d’annulation enregistrée',
      ...result,
    });
  } catch (error) {
    return sendCancelError(res, error);
  }
};

/**
 * POST /api/layaway/admin/dossiers/:id/cancellation/approve
 */
exports.approveCancellation = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await LayawayCancellationService.approveCancellation(
      req.params.id,
      req.user._id,
      {
        refundMode: body.refundMode || body.mode,
        bankDetails: body.bankDetails,
        checkDetails: body.checkDetails,
        notes: body.notes,
        retentionAmount: body.retentionAmount,
        refundAmount: body.refundAmount,
      },
    );
    return res.status(200).json({
      success: true,
      message:
        result.dossierStatus === 'ANNULE'
          ? 'Annulation confirmée (aucun remboursement dû)'
          : 'Annulation approuvée — remboursement en cours',
      ...result,
    });
  } catch (error) {
    return sendCancelError(res, error);
  }
};

/**
 * POST /api/layaway/admin/dossiers/:id/cancellation/reject
 * Body: { reason }
 */
exports.rejectCancellation = async (req, res) => {
  try {
    const result = await LayawayCancellationService.rejectCancellation(
      req.params.id,
      req.user._id,
      { reason: req.body?.reason || req.body?.motif },
    );
    return res.status(200).json({
      success: true,
      message: 'Demande d’annulation refusée',
      ...result,
    });
  } catch (error) {
    return sendCancelError(res, error);
  }
};

/**
 * POST /api/layaway/admin/dossiers/:id/cancellation/execute-refund
 * Body: { reference?, notes? }
 */
exports.executeRefund = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await LayawayCancellationService.executeRefund(
      req.params.id,
      req.user._id,
      { reference: body.reference, notes: body.notes },
    );
    return res.status(200).json({
      success: true,
      message: 'Remboursement exécuté — dossier annulé',
      ...result,
    });
  } catch (error) {
    return sendCancelError(res, error);
  }
};
