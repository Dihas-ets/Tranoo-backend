/**
 * Garantie Layaway — composante financière distincte de l'échéancier.
 * Formule : amount = round(base × percentage / 100) en FCFA (unité entière).
 */

function assertPositiveNumber(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error(`${label} invalide`);
    err.code = 'LAYAWAY_INVALID_AMOUNT';
    throw err;
  }
  return n;
}

/**
 * @param {number} calculationBase - Montant du devis (base)
 * @param {number} percentage - Ex. 5
 * @returns {{ percentage: number, calculationBase: number, amount: number }}
 */
function calculate(calculationBase, percentage) {
  const base = assertPositiveNumber(calculationBase, 'calculationBase');
  const pct = assertPositiveNumber(percentage, 'percentage');
  const amount = Math.round((base * pct) / 100);
  return {
    percentage: pct,
    calculationBase: Math.round(base),
    amount,
  };
}

module.exports = {
  calculate,
};
