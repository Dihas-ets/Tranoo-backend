/**
 * Moteur d'échéancier Layaway.
 * - Calendrier réel (pas 360/365 fixes)
 * - Arrondi sur toutes les échéances sauf la dernière (reste exact)
 * - SUM(amounts) === totalAmount sinon erreur
 *
 * Règle mensuelle (fin de mois) :
 * on ancre le jour du mois de startDate ; si le mois cible n'a pas ce jour,
 * on utilise le dernier jour du mois (ex. 31 jan → 28/29 fév).
 */

const FREQUENCIES = Object.freeze(['DAILY', 'WEEKLY', 'MONTHLY']);

function toUtcDateOnly(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) {
    const err = new Error('Date invalide');
    err.code = 'LAYAWAY_INVALID_DATE';
    throw err;
  }
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(date, days) {
  const d = toUtcDateOnly(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addUtcMonthsClamped(date, months) {
  const d = toUtcDateOnly(date);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

/**
 * Date de fin calendaire = start + durationMonths (même jour, clamp fin de mois).
 */
function computeEndDate(startDate, durationMonths) {
  const months = Number(durationMonths);
  if (!Number.isInteger(months) || months < 1) {
    const err = new Error('Durée invalide');
    err.code = 'LAYAWAY_INVALID_DURATION';
    throw err;
  }
  return addUtcMonthsClamped(startDate, months);
}

function daysBetweenUtc(start, end) {
  const a = toUtcDateOnly(start).getTime();
  const b = toUtcDateOnly(end).getTime();
  return Math.round((b - a) / 86400000);
}

function generateDueDates({ startDate, endDate, frequency }) {
  const start = toUtcDateOnly(startDate);
  const end = toUtcDateOnly(endDate);
  if (end.getTime() <= start.getTime()) {
    const err = new Error('dateFin doit être postérieure à dateDebut');
    err.code = 'LAYAWAY_INVALID_DATE';
    throw err;
  }

  const freq = String(frequency || '').toUpperCase();
  if (!FREQUENCIES.includes(freq)) {
    const err = new Error('Fréquence invalide');
    err.code = 'LAYAWAY_INVALID_FREQUENCY';
    throw err;
  }

  const dates = [];

  if (freq === 'DAILY') {
    // Une échéance par jour calendaire de [start, end) — nb = jours réels entre les bornes
    const n = daysBetweenUtc(start, end);
    for (let i = 0; i < n; i += 1) {
      dates.push(addUtcDays(start, i));
    }
    return dates;
  }

  if (freq === 'WEEKLY') {
    let cursor = start;
    while (cursor.getTime() < end.getTime()) {
      dates.push(new Date(cursor.getTime()));
      cursor = addUtcDays(cursor, 7);
    }
    return dates;
  }

  // MONTHLY : une échéance par mois calendaire tant que due < endDate
  let cursor = start;
  while (cursor.getTime() < end.getTime()) {
    dates.push(new Date(cursor.getTime()));
    cursor = addUtcMonthsClamped(start, dates.length);
  }
  return dates;
}

function allocateAmounts(totalAmount, count) {
  const total = Math.round(Number(totalAmount));
  if (!Number.isFinite(total) || total <= 0) {
    const err = new Error('Montant total invalide');
    err.code = 'LAYAWAY_INVALID_AMOUNT';
    throw err;
  }
  if (!Number.isInteger(count) || count < 1) {
    const err = new Error('Nombre d\'échéances invalide');
    err.code = 'LAYAWAY_INVALID_SCHEDULE';
    throw err;
  }

  const base = Math.floor(total / count);
  const amounts = new Array(count).fill(base);
  const allocated = base * (count - 1);
  amounts[count - 1] = total - allocated;

  const sum = amounts.reduce((acc, v) => acc + v, 0);
  if (sum !== total) {
    const err = new Error('Échec contrôle intégrité échéancier');
    err.code = 'LAYAWAY_SCHEDULE_INTEGRITY';
    throw err;
  }
  return amounts;
}

/**
 * @param {{ totalAmount: number, startDate: Date|string, endDate?: Date|string, durationMonths?: number, frequency: string }} params
 */
function generate(params) {
  const { totalAmount, startDate, frequency } = params || {};
  let { endDate } = params || {};

  if (endDate == null && params.durationMonths != null) {
    endDate = computeEndDate(startDate, params.durationMonths);
  }
  if (endDate == null) {
    const err = new Error('dateFin ou durationMonths requis');
    err.code = 'LAYAWAY_INVALID_DATE';
    throw err;
  }

  const start = toUtcDateOnly(startDate);
  const end = toUtcDateOnly(endDate);
  const freq = String(frequency || '').toUpperCase();
  const dueDates = generateDueDates({ startDate: start, endDate: end, frequency: freq });

  if (dueDates.length < 1) {
    const err = new Error('Aucune échéance générée');
    err.code = 'LAYAWAY_INVALID_SCHEDULE';
    throw err;
  }

  const amounts = allocateAmounts(totalAmount, dueDates.length);
  const installments = dueDates.map((dueDate, index) => ({
    sequence: index + 1,
    dueDate,
    amount: amounts[index],
    paidAmount: 0,
    remainingAmount: amounts[index],
    status: 'PENDING',
    paidAt: null,
  }));

  const sum = installments.reduce((acc, i) => acc + i.amount, 0);
  const total = Math.round(Number(totalAmount));
  if (sum !== total) {
    const err = new Error('Échec contrôle intégrité échéancier');
    err.code = 'LAYAWAY_SCHEDULE_INTEGRITY';
    throw err;
  }

  return {
    frequency: freq,
    startDate: start,
    endDate: end,
    numberOfInstallments: installments.length,
    installments,
    totalAmount: total,
  };
}

/**
 * Premier règlement = garantie + première échéance (montants distincts).
 */
function computeFirstPayment(guaranteeAmount, schedule) {
  const first = schedule?.installments?.[0];
  if (!first) {
    const err = new Error('Échéancier vide');
    err.code = 'LAYAWAY_INVALID_SCHEDULE';
    throw err;
  }
  const g = Math.round(Number(guaranteeAmount));
  const installmentAmount = first.amount;
  return {
    guaranteeAmount: g,
    installmentAmount,
    totalAmount: g + installmentAmount,
  };
}

module.exports = {
  FREQUENCIES,
  toUtcDateOnly,
  addUtcDays,
  addUtcMonthsClamped,
  computeEndDate,
  daysBetweenUtc,
  generate,
  computeFirstPayment,
  allocateAmounts,
};
