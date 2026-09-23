/**
 * Transitions d'état Layaway — seul point autorisé pour muter le statut métier.
 */

const STATUSES = Object.freeze([
  'BROUILLON',
  'CONTRAT_EN_ATTENTE',
  'CONTRAT_SIGNE',
  'ACTIF',
  'EN_RETARD',
  'GELE',
  'PAIEMENT_COMPLET',
  'REMISE_EN_ATTENTE',
  'REMISE_VALIDEE',
  'CLOTURE',
  'ANNULATION_DEMANDEE',
  'REMBOURSEMENT_EN_COURS',
  'ANNULE',
]);

/** from → Set(to) */
const TRANSITIONS = Object.freeze({
  BROUILLON: new Set(['CONTRAT_EN_ATTENTE', 'ANNULE']),
  CONTRAT_EN_ATTENTE: new Set(['CONTRAT_SIGNE', 'ANNULE']),
  CONTRAT_SIGNE: new Set(['ACTIF', 'ANNULATION_DEMANDEE', 'ANNULE']),
  ACTIF: new Set([
    'EN_RETARD',
    'PAIEMENT_COMPLET',
    'ANNULATION_DEMANDEE',
    'GELE',
  ]),
  EN_RETARD: new Set(['ACTIF', 'GELE', 'PAIEMENT_COMPLET', 'ANNULATION_DEMANDEE']),
  GELE: new Set(['ACTIF', 'ANNULATION_DEMANDEE', 'ANNULE']),
  PAIEMENT_COMPLET: new Set(['REMISE_EN_ATTENTE']),
  REMISE_EN_ATTENTE: new Set(['REMISE_VALIDEE']),
  REMISE_VALIDEE: new Set(['CLOTURE']),
  CLOTURE: new Set([]),
  ANNULATION_DEMANDEE: new Set(['REMBOURSEMENT_EN_COURS', 'ACTIF', 'ANNULE']),
  REMBOURSEMENT_EN_COURS: new Set(['ANNULE']),
  ANNULE: new Set([]),
});

function assertStatus(status) {
  if (!STATUSES.includes(status)) {
    const err = new Error(`Statut Layaway inconnu: ${status}`);
    err.code = 'LAYAWAY_INVALID_STATUS';
    throw err;
  }
  return status;
}

function canTransition(from, to) {
  assertStatus(from);
  assertStatus(to);
  return TRANSITIONS[from]?.has(to) === true;
}

/**
 * @returns {{ from: string, to: string }}
 */
function transition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`Transition interdite: ${from} → ${to}`);
    err.code = 'LAYAWAY_TRANSITION_FORBIDDEN';
    err.meta = { from, to };
    throw err;
  }
  return { from, to };
}

module.exports = {
  STATUSES,
  TRANSITIONS,
  assertStatus,
  canTransition,
  transition,
};
