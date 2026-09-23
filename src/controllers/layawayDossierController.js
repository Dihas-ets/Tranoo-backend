const LayawayService = require('../services/layaway/LayawayService');
const { computeFirstPayment } = require('../services/layaway/ScheduleService');

function sendLayawayError(res, error) {
  const codeStatus = {
    LAYAWAY_INVALID_CUSTOMS_CASE: 400,
    LAYAWAY_QUOTE_NOT_FOUND: 404,
    LAYAWAY_INVALID_FREQUENCY: 400,
    LAYAWAY_INVALID_DURATION: 400,
    LAYAWAY_DURATION_NOT_ALLOWED: 400,
    LAYAWAY_DURATION_TOO_LONG: 400,
    LAYAWAY_INVALID_VEHICLE: 400,
    LAYAWAY_VEHICLE_NOT_FOUND: 404,
    LAYAWAY_VEHICLE_NOT_IN_CATALOG: 400,
    LAYAWAY_VEHICLE_NOT_AVAILABLE: 409,
    LAYAWAY_VEHICLE_ALREADY_ENGAGED: 409,
    LAYAWAY_INVALID_AMOUNT: 400,
    LAYAWAY_INVALID_DATE: 400,
    LAYAWAY_INVALID_SCHEDULE: 400,
    LAYAWAY_SCHEDULE_INTEGRITY: 500,
    LAYAWAY_TRANSITION_FORBIDDEN: 409,
    LAYAWAY_NOT_FOUND: 404,
    LAYAWAY_FORBIDDEN: 403,
    LAYAWAY_BUYER_REQUIRED: 401,
  };
  const status = error.status || codeStatus[error.code] || 500;
  const payload = {
    success: false,
    message: error.message || 'Erreur Layaway',
  };
  if (error.code) payload.code = error.code;
  if (error.meta) payload.meta = error.meta;
  if (status >= 500) {
    console.error('[layaway] error:', error);
  }
  return res.status(status).json(payload);
}

function rejectClientAmounts(body, res) {
  const forbidden = [
    'monthlyAmount',
    'totalAmount',
    'guaranteeAmount',
    'remainingBalance',
    'percentagePaid',
    'paidPercentage',
    'installmentAmount',
    'firstPayment',
    'quote',
  ];
  const present = forbidden.filter((k) => body?.[k] !== undefined);
  if (present.length) {
    return res.status(400).json({
      success: false,
      code: 'LAYAWAY_CLIENT_AMOUNTS_FORBIDDEN',
      message:
        'Les montants financiers sont calculés par le backend. N\'envoyez que vehicleId, customsCase, frequency, durationMonths.',
      fields: present,
    });
  }
  return null;
}

/** POST /api/layaway/dossiers/preview */
exports.previewDossier = async (req, res) => {
  try {
    if (rejectClientAmounts(req.body, res)) return;
    const preview = await LayawayService.previewCreation({
      vehicleId: req.body.vehicleId,
      customsCase: req.body.customsCase,
      frequency: req.body.frequency,
      durationMonths: req.body.durationMonths ?? req.body.duration,
      startDate: req.body.startDate,
    });
    return res.status(200).json({ success: true, preview });
  } catch (error) {
    return sendLayawayError(res, error);
  }
};

/** POST /api/layaway/dossiers */
exports.createDossier = async (req, res) => {
  try {
    if (rejectClientAmounts(req.body, res)) return;

    const buyerId = req.user?._id;
    if (!buyerId) {
      return res.status(401).json({
        success: false,
        code: 'LAYAWAY_BUYER_REQUIRED',
        message: 'Authentification acheteur requise',
      });
    }
    if (req.user.role && req.user.role !== 'acheteur' && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        code: 'LAYAWAY_BUYER_ONLY',
        message: 'Seuls les acheteurs peuvent créer un dossier Layaway',
      });
    }

    const { layaway, firstPayment } = await LayawayService.createDossier({
      buyerId,
      vehicleId: req.body.vehicleId,
      customsCase: req.body.customsCase,
      frequency: req.body.frequency,
      durationMonths: req.body.durationMonths ?? req.body.duration,
      startDate: req.body.startDate,
    });

    return res.status(201).json({
      success: true,
      message: 'Dossier Layaway créé',
      dossier: LayawayService.buildPublicDossierView(layaway, firstPayment),
      schedule: layaway.schedule,
    });
  } catch (error) {
    return sendLayawayError(res, error);
  }
};

/** GET /api/layaway/dossiers */
exports.listMyDossiers = async (req, res) => {
  try {
    const buyerId = req.user?._id;
    if (!buyerId) {
      return res.status(401).json({ success: false, message: 'Non authentifié' });
    }
    const dossiers = await LayawayService.listDossiersForBuyer(buyerId, {
      status: req.query.status,
    });
    return res.status(200).json({
      success: true,
      count: dossiers.length,
      dossiers: dossiers.map((d) => {
        let firstPayment = null;
        try {
          firstPayment = computeFirstPayment(d.guarantee.amount, d.schedule);
        } catch (_) {
          /* ignore */
        }
        return LayawayService.buildPublicDossierView(d, firstPayment);
      }),
    });
  } catch (error) {
    return sendLayawayError(res, error);
  }
};

/** GET /api/layaway/dossiers/:id */
exports.getMyDossier = async (req, res) => {
  try {
    const layaway = await LayawayService.getDossierForBuyer(
      req.params.id,
      req.user._id,
    );
    const firstPayment = computeFirstPayment(
      layaway.guarantee.amount,
      layaway.schedule,
    );
    return res.status(200).json({
      success: true,
      dossier: LayawayService.buildPublicDossierView(layaway, firstPayment),
      schedule: layaway.schedule,
      vehicle: layaway.vehicleId,
    });
  } catch (error) {
    return sendLayawayError(res, error);
  }
};

/** GET /api/layaway/dossiers/:id/schedule */
exports.getMySchedule = async (req, res) => {
  try {
    const layaway = await LayawayService.getDossierForBuyer(
      req.params.id,
      req.user._id,
    );
    return res.status(200).json({
      success: true,
      layawayId: layaway._id,
      schedule: layaway.schedule,
      aggregates: layaway.aggregates,
    });
  } catch (error) {
    return sendLayawayError(res, error);
  }
};
