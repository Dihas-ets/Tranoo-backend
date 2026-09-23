const Article = require('../models/Article');
const {
  LAYAWAY_PUBLICATION_STATUSES,
  adminLayawayCatalogFilter,
  buyerVisibleLayawayFilter,
  assertLayawayVehicle,
} = require('../services/layaway/LayawayCatalogService');

const VEHICLE_TYPES = new Set(['voiture', 'moto']);

function parseOptionalNumber(value, label) {
  if (value === undefined || value === null || value === '') return { value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return { error: `${label} invalide` };
  }
  return { value: Math.round(n) };
}

function buildLayawayPricing(body, existing) {
  const withCustoms = parseOptionalNumber(
    body.quoteWithCustoms ?? body.layawayPricing?.quoteWithCustoms,
    'quoteWithCustoms',
  );
  if (withCustoms.error) return withCustoms;
  const withoutCustoms = parseOptionalNumber(
    body.quoteWithoutCustoms ?? body.layawayPricing?.quoteWithoutCustoms,
    'quoteWithoutCustoms',
  );
  if (withoutCustoms.error) return withoutCustoms;

  const currency =
    body.currency ||
    body.layawayPricing?.currency ||
    existing?.layawayPricing?.currency ||
    'XOF';

  return {
    value: {
      quoteWithCustoms:
        withCustoms.value !== null
          ? withCustoms.value
          : existing?.layawayPricing?.quoteWithCustoms ?? null,
      quoteWithoutCustoms:
        withoutCustoms.value !== null
          ? withoutCustoms.value
          : existing?.layawayPricing?.quoteWithoutCustoms ?? null,
      currency: String(currency).toUpperCase(),
    },
  };
}

function sanitizeVehiclePayload(body) {
  const forbidden = [
    'source',
    'layawayPublicationStatus',
    'statutVente',
    'acheteur',
    'subscriptionLocked',
    'alertContext',
  ];
  const payload = { ...body };
  for (const key of forbidden) {
    delete payload[key];
  }
  delete payload.layawayPricing;
  delete payload.quoteWithCustoms;
  delete payload.quoteWithoutCustoms;
  delete payload.currency;
  return payload;
}

async function findLayawayVehicle(id) {
  const article = await Article.findById(id);
  if (!article || article.source !== 'layaway') {
    return null;
  }
  return article;
}

/** GET /api/admin/layaway/vehicles */
exports.listAdminVehicles = async (req, res) => {
  try {
    const filter = adminLayawayCatalogFilter();
    const { type, publicationStatus, q } = req.query;

    if (type) {
      if (!VEHICLE_TYPES.has(String(type).toLowerCase())) {
        return res.status(400).json({ message: 'type invalide (voiture|moto)' });
      }
      filter.type = String(type).toLowerCase();
    }
    if (publicationStatus) {
      const status = String(publicationStatus).toUpperCase();
      if (!LAYAWAY_PUBLICATION_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'publicationStatus invalide' });
      }
      filter.layawayPublicationStatus = status;
    }
    if (q && String(q).trim()) {
      const term = String(q).trim();
      filter.$or = [
        { titre: new RegExp(term, 'i') },
        { marque: new RegExp(term, 'i') },
        { modele: new RegExp(term, 'i') },
      ];
    }

    const vehicles = await Article.find(filter)
      .sort({ dateCreation: -1 })
      .populate('vendeur', 'nom prenoms email entreprise telephone');

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      vehicles,
    });
  } catch (error) {
    console.error('[layaway-vehicles] listAdmin error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/** GET /api/layaway/vehicles — catalogue acheteur (PUBLIE uniquement) */
exports.listBuyerVehicles = async (req, res) => {
  try {
    const filter = buyerVisibleLayawayFilter();
    const { type } = req.query;
    if (type) {
      if (!VEHICLE_TYPES.has(String(type).toLowerCase())) {
        return res.status(400).json({ message: 'type invalide (voiture|moto)' });
      }
      filter.type = String(type).toLowerCase();
    }

    const vehicles = await Article.find(filter).sort({ layawayPublishedAt: -1, dateCreation: -1 });
    return res.status(200).json({
      success: true,
      count: vehicles.length,
      vehicles,
    });
  } catch (error) {
    console.error('[layaway-vehicles] listBuyer error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/** GET /api/admin/layaway/vehicles/:id  ou  /api/layaway/vehicles/:id */
exports.getVehicle = async (req, res) => {
  try {
    const article = await Article.findById(req.params.id).populate(
      'vendeur',
      'nom prenoms email entreprise telephone',
    );
    if (!article || article.source !== 'layaway') {
      return res.status(404).json({ message: 'Véhicule Layaway introuvable' });
    }

    const isAdmin = req.user?.role === 'admin' || Boolean(req.user?.typeAdmin);
    if (!isAdmin && article.layawayPublicationStatus !== 'PUBLIE') {
      return res.status(404).json({ message: 'Véhicule Layaway introuvable' });
    }

    return res.status(200).json({ success: true, vehicle: article });
  } catch (error) {
    console.error('[layaway-vehicles] get error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/** POST /api/admin/layaway/vehicles */
exports.createVehicle = async (req, res) => {
  try {
    const body = req.body || {};
    const type = String(body.type || '').toLowerCase();
    if (!VEHICLE_TYPES.has(type)) {
      return res.status(400).json({ message: 'type requis: voiture ou moto' });
    }
    if (!body.titre || !String(body.titre).trim()) {
      return res.status(400).json({ message: 'titre requis' });
    }

    const pricing = buildLayawayPricing(body);
    if (pricing.error) {
      return res.status(400).json({ message: pricing.error });
    }
    if (
      pricing.value.quoteWithCustoms == null &&
      pricing.value.quoteWithoutCustoms == null
    ) {
      return res.status(400).json({
        message: 'Au moins un devis (quoteWithCustoms ou quoteWithoutCustoms) est requis',
      });
    }

    const vendeurId =
      body.vendeur ||
      (req.user?._id ? req.user._id.toString() : null);
    if (!vendeurId) {
      return res.status(400).json({ message: 'vendeur requis' });
    }

    const publicationStatus = String(
      body.layawayPublicationStatus || 'BROUILLON',
    ).toUpperCase();
    if (!LAYAWAY_PUBLICATION_STATUSES.includes(publicationStatus)) {
      return res.status(400).json({ message: 'layawayPublicationStatus invalide' });
    }
    if (!['BROUILLON', 'PUBLIE', 'RETIRE', 'INDISPONIBLE'].includes(publicationStatus)) {
      return res.status(400).json({
        message:
          'À la création, statut autorisé: BROUILLON, PUBLIE, RETIRE, INDISPONIBLE',
      });
    }

    const displayPrice =
      pricing.value.quoteWithoutCustoms ??
      pricing.value.quoteWithCustoms ??
      body.prix ??
      null;

    const payload = sanitizeVehiclePayload(body);
    const article = new Article({
      ...payload,
      type,
      titre: String(body.titre).trim(),
      prix: displayPrice,
      vendeur: vendeurId,
      source: 'layaway',
      layawayPublicationStatus: publicationStatus,
      layawayPricing: pricing.value,
      layawayPublishedAt: publicationStatus === 'PUBLIE' ? new Date() : null,
      statut: publicationStatus === 'PUBLIE' ? 'en_ligne' : 'en_attente',
      statutVente: 'non vendu',
      entreprise: body.entreprise || 'TRANOO LAYAWAY',
      viewsReal: 0,
      viewsAuto: 0,
      views: 0,
    });

    await article.save();

    return res.status(201).json({
      success: true,
      message: 'Véhicule Layaway créé',
      vehicle: article,
    });
  } catch (error) {
    console.error('[layaway-vehicles] create error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/** PATCH /api/admin/layaway/vehicles/:id */
exports.updateVehicle = async (req, res) => {
  try {
    const article = await findLayawayVehicle(req.params.id);
    if (!article) {
      return res.status(404).json({ message: 'Véhicule Layaway introuvable' });
    }

    if (['RESERVE', 'ENGAGE', 'REMIS'].includes(article.layawayPublicationStatus)) {
      return res.status(409).json({
        message: `Véhicule ${article.layawayPublicationStatus}: modification limitée. Utilisez les actions métier dédiées.`,
        code: 'LAYAWAY_VEHICLE_LOCKED',
      });
    }

    const body = req.body || {};
    if (body.type !== undefined) {
      const type = String(body.type).toLowerCase();
      if (!VEHICLE_TYPES.has(type)) {
        return res.status(400).json({ message: 'type invalide (voiture|moto)' });
      }
      article.type = type;
    }

    const pricing = buildLayawayPricing(body, article);
    if (pricing.error) {
      return res.status(400).json({ message: pricing.error });
    }
    article.layawayPricing = pricing.value;
    if (pricing.value.quoteWithoutCustoms != null || pricing.value.quoteWithCustoms != null) {
      article.prix =
        pricing.value.quoteWithoutCustoms ?? pricing.value.quoteWithCustoms;
    }

    const payload = sanitizeVehiclePayload(body);
    const allowed = [
      'titre',
      'description',
      'photos',
      'video',
      'marque',
      'modele',
      'annee',
      'cylindre',
      'boiteVitesse',
      'carburant',
      'climatiseur',
      'distance',
      'sieges',
      'portes',
      'condition',
      'couleur',
      'dedouanement',
      'lieu',
      'localisation',
      'pays',
      'typeMoto',
      'puissance',
      'transmission',
      'demarrage',
      'refroidissement',
      'capaciteReservoir',
      'autonomie',
      'disponibilite',
      'garantieConstructeur',
      'dureeGarantie',
      'kilometrage',
      'equipements',
      'devise',
      'entreprise',
    ];
    for (const key of allowed) {
      if (payload[key] !== undefined) {
        article[key] = payload[key];
      }
    }

    await article.save();
    return res.status(200).json({
      success: true,
      message: 'Véhicule Layaway mis à jour',
      vehicle: article,
    });
  } catch (error) {
    console.error('[layaway-vehicles] update error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Transition publication Layaway.
 * POST /api/admin/layaway/vehicles/:id/publish
 * POST /api/admin/layaway/vehicles/:id/withdraw
 * PATCH /api/admin/layaway/vehicles/:id/publication-status
 */
exports.setPublicationStatus = async (req, res) => {
  try {
    const article = await findLayawayVehicle(req.params.id);
    if (!article) {
      return res.status(404).json({ message: 'Véhicule Layaway introuvable' });
    }

    const fromAction =
      req.layawayPublicationAction ||
      (req.body && req.body.layawayPublicationStatus);
    const next = String(fromAction || '').toUpperCase();
    if (!LAYAWAY_PUBLICATION_STATUSES.includes(next)) {
      return res.status(400).json({ message: 'Statut de publication invalide' });
    }

    const current = article.layawayPublicationStatus;
    const manualAllowed = {
      BROUILLON: new Set(['PUBLIE', 'RETIRE', 'INDISPONIBLE']),
      PUBLIE: new Set(['RETIRE', 'INDISPONIBLE', 'BROUILLON']),
      RETIRE: new Set(['BROUILLON', 'PUBLIE', 'INDISPONIBLE']),
      INDISPONIBLE: new Set(['BROUILLON', 'PUBLIE', 'RETIRE']),
      RESERVE: new Set(['PUBLIE', 'RETIRE', 'INDISPONIBLE']),
      ENGAGE: new Set([]),
      REMIS: new Set([]),
    };

    if (!manualAllowed[current]?.has(next)) {
      return res.status(409).json({
        message: `Transition publication interdite: ${current} → ${next}`,
        code: 'LAYAWAY_PUBLICATION_TRANSITION_FORBIDDEN',
      });
    }

    article.layawayPublicationStatus = next;
    if (next === 'PUBLIE') {
      article.statut = 'en_ligne';
      article.layawayPublishedAt = new Date();
      article.layawayWithdrawnAt = null;
    } else if (next === 'RETIRE') {
      article.statut = 'non_vendu';
      article.layawayWithdrawnAt = new Date();
    } else if (next === 'BROUILLON' || next === 'INDISPONIBLE') {
      article.statut = 'en_attente';
    }

    await article.save();
    return res.status(200).json({
      success: true,
      message: `Publication: ${current} → ${next}`,
      vehicle: article,
    });
  } catch (error) {
    console.error('[layaway-vehicles] publication error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.publishVehicle = (req, res) => {
  req.layawayPublicationAction = 'PUBLIE';
  return exports.setPublicationStatus(req, res);
};

exports.withdrawVehicle = (req, res) => {
  req.layawayPublicationAction = 'RETIRE';
  return exports.setPublicationStatus(req, res);
};

/** DELETE /api/admin/layaway/vehicles/:id — soft delete via RETIRE si engagé, sinon hard delete si brouillon */
exports.deleteVehicle = async (req, res) => {
  try {
    const article = await findLayawayVehicle(req.params.id);
    if (!article) {
      return res.status(404).json({ message: 'Véhicule Layaway introuvable' });
    }

    if (['RESERVE', 'ENGAGE', 'REMIS'].includes(article.layawayPublicationStatus)) {
      return res.status(409).json({
        message: 'Impossible de supprimer un véhicule réservé, engagé ou remis. Retirez-le si besoin.',
        code: 'LAYAWAY_VEHICLE_NOT_DELETABLE',
      });
    }

    if (article.layawayPublicationStatus === 'PUBLIE') {
      article.layawayPublicationStatus = 'RETIRE';
      article.statut = 'non_vendu';
      article.layawayWithdrawnAt = new Date();
      await article.save();
      return res.status(200).json({
        success: true,
        message: 'Véhicule publié retiré du catalogue (RETIRE)',
        vehicle: article,
      });
    }

    await Article.deleteOne({ _id: article._id, source: 'layaway' });
    return res.status(200).json({
      success: true,
      message: 'Véhicule Layaway supprimé',
    });
  } catch (error) {
    console.error('[layaway-vehicles] delete error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Réexport utilitaire pour tests / autres services
exports._assertLayawayVehicle = assertLayawayVehicle;
