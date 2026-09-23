/**
 * Tests du moteur d'échéancier + garantie Layaway (sans Mongo).
 * Run: node tests/layawaySchedule.test.js
 */

const assert = require('assert');
const ScheduleService = require('../src/services/layaway/ScheduleService');
const GuaranteeService = require('../src/services/layaway/GuaranteeService');
const {
  canTransition,
  transition,
} = require('../src/services/layaway/LayawayStateMachine');

function sumAmounts(schedule) {
  return schedule.installments.reduce((acc, i) => acc + i.amount, 0);
}

function run() {
  // --- Garantie ---
  const g = GuaranteeService.calculate(3_000_000, 5);
  assert.strictEqual(g.amount, 150_000);
  assert.strictEqual(g.calculationBase, 3_000_000);
  assert.strictEqual(g.percentage, 5);

  // --- Cas mensuel 12 mois ---
  const monthly = ScheduleService.generate({
    totalAmount: 3_000_000,
    startDate: '2026-10-01T00:00:00.000Z',
    durationMonths: 12,
    frequency: 'MONTHLY',
  });
  assert.strictEqual(monthly.numberOfInstallments, 12);
  assert.strictEqual(sumAmounts(monthly), 3_000_000);
  assert.strictEqual(monthly.endDate.toISOString().slice(0, 10), '2027-10-01');

  // --- Arrondi 1 000 000 / 3 ---
  const roundCase = ScheduleService.generate({
    totalAmount: 1_000_000,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-04T00:00:00.000Z',
    frequency: 'DAILY',
  });
  assert.strictEqual(roundCase.numberOfInstallments, 3);
  assert.deepStrictEqual(
    roundCase.installments.map((i) => i.amount),
    [333_333, 333_333, 333_334],
  );
  assert.strictEqual(sumAmounts(roundCase), 1_000_000);

  // --- Journalier 1 an (2026-10-01 → 2027-10-01 = 365 jours) ---
  const daily = ScheduleService.generate({
    totalAmount: 3_000_000,
    startDate: '2026-10-01T00:00:00.000Z',
    durationMonths: 12,
    frequency: 'DAILY',
  });
  assert.strictEqual(daily.numberOfInstallments, 365);
  assert.strictEqual(sumAmounts(daily), 3_000_000);
  assert.strictEqual(daily.installments[0].amount, Math.floor(3_000_000 / 365));
  assert.strictEqual(
    daily.installments[364].amount,
    3_000_000 - Math.floor(3_000_000 / 365) * 364,
  );

  // --- Hebdomadaire : pas de 7 jours ---
  const weekly = ScheduleService.generate({
    totalAmount: 100_000,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-29T00:00:00.000Z',
    frequency: 'WEEKLY',
  });
  assert.strictEqual(weekly.numberOfInstallments, 4);
  for (let i = 1; i < weekly.installments.length; i += 1) {
    const prev = weekly.installments[i - 1].dueDate.getTime();
    const cur = weekly.installments[i].dueDate.getTime();
    assert.strictEqual((cur - prev) / 86400000, 7);
  }
  assert.strictEqual(sumAmounts(weekly), 100_000);

  // --- Année bissextile : 2024-02-01 → 2025-02-01 = 366 jours ---
  const leap = ScheduleService.generate({
    totalAmount: 366_000,
    startDate: '2024-02-01T00:00:00.000Z',
    endDate: '2025-02-01T00:00:00.000Z',
    frequency: 'DAILY',
  });
  assert.strictEqual(leap.numberOfInstallments, 366);
  assert.strictEqual(sumAmounts(leap), 366_000);

  // --- Fin de mois : 31 jan → février clamp ---
  const eom = ScheduleService.addUtcMonthsClamped(
    new Date('2026-01-31T00:00:00.000Z'),
    1,
  );
  assert.strictEqual(eom.toISOString().slice(0, 10), '2026-02-28');

  const monthlyEom = ScheduleService.generate({
    totalAmount: 90_000,
    startDate: '2026-01-31T00:00:00.000Z',
    durationMonths: 3,
    frequency: 'MONTHLY',
  });
  assert.strictEqual(monthlyEom.numberOfInstallments, 3);
  assert.strictEqual(
    monthlyEom.installments[0].dueDate.toISOString().slice(0, 10),
    '2026-01-31',
  );
  assert.strictEqual(
    monthlyEom.installments[1].dueDate.toISOString().slice(0, 10),
    '2026-02-28',
  );
  assert.strictEqual(sumAmounts(monthlyEom), 90_000);

  // --- Premier règlement = garantie + 1ère échéance ---
  const first = ScheduleService.computeFirstPayment(150_000, daily);
  assert.strictEqual(first.guaranteeAmount, 150_000);
  assert.strictEqual(first.installmentAmount, daily.installments[0].amount);
  assert.strictEqual(
    first.totalAmount,
    150_000 + daily.installments[0].amount,
  );

  // --- State machine ---
  assert.strictEqual(canTransition('BROUILLON', 'CONTRAT_EN_ATTENTE'), true);
  assert.strictEqual(canTransition('ACTIF', 'CLOTURE'), false);
  assert.throws(() => transition('ACTIF', 'CLOTURE'), (err) => {
    assert.strictEqual(err.code, 'LAYAWAY_TRANSITION_FORBIDDEN');
    return true;
  });
  transition('ACTIF', 'PAIEMENT_COMPLET');
  transition('REMISE_VALIDEE', 'CLOTURE');

  // --- Fréquence invalide ---
  assert.throws(
    () =>
      ScheduleService.generate({
        totalAmount: 1000,
        startDate: '2026-01-01',
        endDate: '2026-02-01',
        frequency: 'YEARLY',
      }),
    (err) => err.code === 'LAYAWAY_INVALID_FREQUENCY',
  );

  console.log('Layaway schedule / guarantee / state-machine tests passed ✅');
}

try {
  run();
  process.exit(0);
} catch (error) {
  console.error('Layaway schedule tests failed ❌');
  console.error(error);
  process.exit(1);
}
