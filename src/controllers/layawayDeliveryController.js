const LayawayDeliveryService = require('../services/layaway/LayawayDeliveryService');

function sendDeliveryError(res, error) {
  const codeStatus = {
    LAYAWAY_NOT_FOUND: 404,
    LAYAWAY_FORBIDDEN: 403,
    LAYAWAY_DELIVERY_PV_REQUIRED: 400,
    LAYAWAY_DELIVERY_PV_SIGNATURE_REQUIRED: 400,
    LAYAWAY_DELIVERY_PV_SIGNATURE_INVALID: 400,
    LAYAWAY_DELIVERY_PV_INCOMPLETE: 409,
    LAYAWAY_DELIVERY_FORBIDDEN: 409,
    LAYAWAY_DELIVERY_VALIDATE_FORBIDDEN: 409,
    LAYAWAY_DELIVERY_NOT_SUBMITTED: 409,
    LAYAWAY_DELIVERY_REJECT_FORBIDDEN: 409,
    LAYAWAY_DELIVERY_REJECT_REASON_REQUIRED: 400,
    LAYAWAY_TRANSITION_FORBIDDEN: 409,
  };
  const status = error.status || codeStatus[error.code] || 500;
  const payload = {
    success: false,
    message: error.message || 'Erreur remise Layaway',
  };
  if (error.code) payload.code = error.code;
  if (error.meta) payload.meta = error.meta;
  if (status >= 500) console.error('[layaway-delivery] error:', error);
  return res.status(status).json(payload);
}

function isAdminUser(user) {
  return Boolean(user?.role === 'admin' || user?.typeAdmin);
}

/** GET /api/layaway/dossiers/:id/delivery */
exports.getDelivery = async (req, res) => {
  try {
    const result = await LayawayDeliveryService.getDelivery(req.params.id, {
      buyerId: req.user._id,
      isAdmin: isAdminUser(req.user),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendDeliveryError(res, error);
  }
};

/**
 * POST /api/layaway/dossiers/:id/delivery
 * Body: { pvUrl, signatureData [, firstName, lastName, notes] }
 * Pièce d’identité : déjà collectée à la signature du contrat.
 */
exports.submitDelivery = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await LayawayDeliveryService.submitDelivery(req.params.id, {
      buyerId: req.user._id,
      isAdmin: isAdminUser(req.user),
      pvUrl: body.pvUrl || body.pv,
      signatureData: body.signatureData || body.signature || body.pvSignature,
      firstName: body.firstName || body.prenom,
      lastName: body.lastName || body.nom,
      notes: body.notes,
    });
    return res.status(200).json({
      success: true,
      message: 'PV de remise signé soumis',
      ...result,
    });
  } catch (error) {
    return sendDeliveryError(res, error);
  }
};

/**
 * POST /api/layaway/admin/dossiers/:id/delivery/validate
 * Body: { notes? }
 */
exports.validateDelivery = async (req, res) => {
  try {
    const result = await LayawayDeliveryService.validateDelivery(
      req.params.id,
      req.user._id,
      { notes: req.body?.notes },
    );
    return res.status(200).json({
      success: true,
      message: 'Remise validée',
      ...result,
    });
  } catch (error) {
    return sendDeliveryError(res, error);
  }
};

/**
 * POST /api/layaway/admin/dossiers/:id/delivery/reject
 * Body: { reason }
 */
exports.rejectDelivery = async (req, res) => {
  try {
    const result = await LayawayDeliveryService.rejectDelivery(
      req.params.id,
      req.user._id,
      { reason: req.body?.reason || req.body?.motif },
    );
    return res.status(200).json({
      success: true,
      message: 'PV de remise rejeté',
      ...result,
    });
  } catch (error) {
    return sendDeliveryError(res, error);
  }
};
