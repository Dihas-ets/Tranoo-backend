const LayawayContractService = require('../services/layaway/LayawayContractService');

function sendContractError(res, error) {
  const codeStatus = {
    LAYAWAY_NOT_FOUND: 404,
    LAYAWAY_FORBIDDEN: 403,
    LAYAWAY_CONTRACT_DOCUMENT_REQUIRED: 400,
    LAYAWAY_CONTRACT_ALREADY_SIGNED: 409,
    LAYAWAY_CONTRACT_ATTACH_FORBIDDEN: 409,
    LAYAWAY_CONTRACT_SIGN_FORBIDDEN: 409,
    LAYAWAY_CONTRACT_DOCUMENT_MISSING: 409,
    LAYAWAY_CONTRACT_SIGNER_REQUIRED: 400,
    LAYAWAY_CONTRACT_SIGNATURE_REQUIRED: 400,
    LAYAWAY_CONTRACT_SIGNATURE_INVALID: 400,
    LAYAWAY_CONTRACT_ID_REQUIRED: 400,
    LAYAWAY_TRANSITION_FORBIDDEN: 409,
  };
  const status = error.status || codeStatus[error.code] || 500;
  const payload = {
    success: false,
    message: error.message || 'Erreur contrat Layaway',
  };
  if (error.code) payload.code = error.code;
  if (error.meta) payload.meta = error.meta;
  if (status >= 500) console.error('[layaway-contract] error:', error);
  return res.status(status).json(payload);
}

function isAdminUser(user) {
  return Boolean(user?.role === 'admin' || user?.typeAdmin);
}

/** GET /api/layaway/dossiers/:id/contract */
exports.getContract = async (req, res) => {
  try {
    const result = await LayawayContractService.getContract(req.params.id, {
      buyerId: req.user._id,
      isAdmin: isAdminUser(req.user),
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return sendContractError(res, error);
  }
};

/**
 * POST /api/layaway/dossiers/:id/contract/sign
 * Body: firstName, lastName, signatureData, idDocumentUrl [, signedDocumentUrl]
 */
exports.signContract = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await LayawayContractService.signContract(req.params.id, {
      buyerId: req.user._id,
      firstName: body.firstName || body.prenom,
      lastName: body.lastName || body.nom,
      signatureData: body.signatureData || body.signature,
      signedDocumentUrl: body.signedDocumentUrl,
      idDocumentUrl:
        body.idDocumentUrl ||
        body.identityDocumentUrl ||
        body.pieceIdentiteUrl ||
        body.carteIdentiteUrl,
      ip: req.ip || req.headers['x-forwarded-for'] || null,
      userAgent: req.headers['user-agent'] || null,
    });
    return res.status(200).json({
      success: true,
      message: 'Contrat signé',
      ...result,
    });
  } catch (error) {
    return sendContractError(res, error);
  }
};

/**
 * PUT /api/layaway/admin/dossiers/:id/contract/document
 * Body: { documentUrl }
 */
exports.attachDocument = async (req, res) => {
  try {
    const result = await LayawayContractService.attachDocument(
      req.params.id,
      req.body?.documentUrl,
    );
    return res.status(200).json({
      success: true,
      message: 'Document contrat associé',
      ...result,
    });
  } catch (error) {
    return sendContractError(res, error);
  }
};
