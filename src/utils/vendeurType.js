const ALLOWED_VENDEUR_TYPES = ['mixte', 'vehicules', 'pieces', 'motos'];

const ALIASES = {
  mixte: 'mixte',
  vehicules: 'vehicules',
  vehicule: 'vehicules',
  vendeurvehicules: 'vehicules',
  pieces: 'pieces',
  piece: 'pieces',
  vendeurpieces: 'pieces',
  motos: 'motos',
  moto: 'motos',
  vendeurmotos: 'motos',
};

/**
 * @param {unknown} raw
 * @returns {string | null | undefined} valeur normalisée, null si vide, undefined si invalide
 */
function normalizeVendeurType(raw) {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  const key = trimmed.toLowerCase().replace(/[\s_-]/g, '');
  const mapped = ALIASES[key];
  if (mapped) return mapped;
  if (ALLOWED_VENDEUR_TYPES.includes(trimmed)) return trimmed;
  return undefined;
}

function isVendeurTypeValidationError(err) {
  return (
    err?.name === 'ValidationError' &&
    err?.errors &&
    Object.prototype.hasOwnProperty.call(err.errors, 'vendeurType')
  );
}

module.exports = {
  ALLOWED_VENDEUR_TYPES,
  normalizeVendeurType,
  isVendeurTypeValidationError,
};
