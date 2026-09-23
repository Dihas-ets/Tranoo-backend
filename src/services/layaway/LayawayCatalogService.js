/**
 * Helpers catalogue Layaway — canal source=layaway isolé de Tranoo / app.
 */

const LAYAWAY_PUBLICATION_STATUSES = Object.freeze([
  'BROUILLON',
  'PUBLIE',
  'RESERVE',
  'ENGAGE',
  'REMIS',
  'RETIRE',
  'INDISPONIBLE',
]);

/** Filtre listes acheteur catalogue Layaway ouvert */
function buyerVisibleLayawayFilter(extra = {}) {
  return {
    source: 'layaway',
    layawayPublicationStatus: 'PUBLIE',
    type: { $in: ['voiture', 'moto'] },
    ...extra,
  };
}

/** Filtre admin section Layaway (tous statuts publication) */
function adminLayawayCatalogFilter(extra = {}) {
  return {
    source: 'layaway',
    ...extra,
  };
}

function assertLayawayVehicle(article) {
  if (!article) {
    const err = new Error('Véhicule introuvable');
    err.code = 'LAYAWAY_VEHICLE_NOT_FOUND';
    err.status = 404;
    throw err;
  }
  if (article.source !== 'layaway') {
    const err = new Error('Véhicule hors catalogue Layaway');
    err.code = 'LAYAWAY_VEHICLE_NOT_IN_CATALOG';
    err.status = 400;
    throw err;
  }
  return article;
}

function isBuyerVisible(article) {
  return (
    article &&
    article.source === 'layaway' &&
    article.layawayPublicationStatus === 'PUBLIE'
  );
}

module.exports = {
  LAYAWAY_PUBLICATION_STATUSES,
  buyerVisibleLayawayFilter,
  adminLayawayCatalogFilter,
  assertLayawayVehicle,
  isBuyerVisible,
};
