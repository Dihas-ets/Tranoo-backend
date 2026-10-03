/**
 * Tests moteur Layaway — logique finalisée (sans Mongo).
 * Run: node tests/layawaySchedule.test.js
 */

const assert = require('assert');
const ScheduleService = require('../src/services/layaway/ScheduleService');
const {
  canTransition,
  transition,
} = require('../src/services/layaway/LayawayStateMachine');
const { DEFAULTS } = require('../src/models/LayawaySettings');

function sumAmounts(schedule) {
  return schedule.installments.reduce((acc, i) => acc + i.amount, 0);
}

function run() {
  // --- Defaults métier finalisés ---
  assert.strictEqual(DEFAULTS.retentionPercentage, 20);
  assert.strictEqual(DEFAULTS.delayGracePeriodDays, 15);
  assert.strictEqual(DEFAULTS.defaultThresholdMonths, 3);
  assert.strictEqual(DEFAULTS.guaranteePercentage, 0);

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

  // --- Journalier 1 an ---
  const daily = ScheduleService.generate({
    totalAmount: 3_000_000,
    startDate: '2026-10-01T00:00:00.000Z',
    durationMonths: 12,
    frequency: 'DAILY',
  });
  assert.strictEqual(daily.numberOfInstallments, 365);
  assert.strictEqual(sumAmounts(daily), 3_000_000);

  // --- Hebdomadaire ---
  const weekly = ScheduleService.generate({
    totalAmount: 100_000,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2026-01-29T00:00:00.000Z',
    frequency: 'WEEKLY',
  });
  assert.strictEqual(weekly.numberOfInstallments, 4);
  assert.strictEqual(sumAmounts(weekly), 100_000);

  // --- Fin de mois clamp ---
  const eom = ScheduleService.addUtcMonthsClamped(
    new Date('2026-01-31T00:00:00.000Z'),
    1,
  );
  assert.strictEqual(eom.toISOString().slice(0, 10), '2026-02-28');

  // --- Premier règlement = 1er tour uniquement (plus de garantie) ---
  const first = ScheduleService.computeFirstPayment(daily);
  assert.strictEqual(first.guaranteeAmount, 0);
  assert.strictEqual(first.installmentAmount, daily.installments[0].amount);
  assert.strictEqual(first.tourAmount, daily.installments[0].amount);
  assert.strictEqual(first.totalAmount, daily.installments[0].amount);

  // Compat legacy (guaranteeAmount, schedule)
  const firstLegacy = ScheduleService.computeFirstPayment(150_000, daily);
  assert.strictEqual(firstLegacy.guaranteeAmount, 0);
  assert.strictEqual(firstLegacy.totalAmount, daily.installments[0].amount);

  // --- State machine ---
  assert.strictEqual(canTransition('BROUILLON', 'CONTRAT_EN_ATTENTE'), true);
  assert.strictEqual(canTransition('ACTIF', 'CLOTURE'), false);
  assert.strictEqual(canTransition('ACTIF', 'ANNULE'), true); // rupture auto
  assert.strictEqual(canTransition('EN_RETARD', 'ANNULE'), true);
  assert.strictEqual(canTransition('ACTIF', 'GELE'), false); // plus de gel
  assert.throws(() => transition('ACTIF', 'CLOTURE'), (err) => {
    assert.strictEqual(err.code, 'LAYAWAY_TRANSITION_FORBIDDEN');
    return true;
  });
  transition('ACTIF', 'PAIEMENT_COMPLET');
  transition('REMISE_VALIDEE', 'CLOTURE');

  // --- Allocation : tours uniquement ---
  const Alloc = require('../src/services/layaway/LayawayPaymentAllocation');
  const fakeLayaway = {
    pricing: { totalAmount: 300_000 },
    schedule: {
      installments: [
        { sequence: 1, amount: 100_000, paidAmount: 0, remainingAmount: 100_000, status: 'PENDING' },
        { sequence: 2, amount: 100_000, paidAmount: 0, remainingAmount: 100_000, status: 'PENDING' },
        { sequence: 3, amount: 100_000, paidAmount: 0, remainingAmount: 100_000, status: 'PENDING' },
      ],
    },
  };
  const minFirst = Alloc.computeMinimumDue(fakeLayaway);
  assert.strictEqual(minFirst.minimumAmount, 100_000);
  assert.strictEqual(minFirst.kind, 'FIRST_TOUR');
  assert.throws(
    () => Alloc.resolvePayableAmount(fakeLayaway, 50_000),
    (err) => err.code === 'LAYAWAY_AMOUNT_BELOW_MINIMUM',
  );
  const over = Alloc.resolvePayableAmount(fakeLayaway, 200_000);
  assert.strictEqual(over.amount, 200_000);
  const plan = Alloc.planAllocation(fakeLayaway, 200_000);
  assert.strictEqual(plan.guaranteeAmount, 0);
  assert.strictEqual(plan.installmentAmount, 200_000);
  assert.deepStrictEqual(
    plan.allocations.map((a) => [a.sequence, a.amount]),
    [
      [1, 100_000],
      [2, 100_000],
    ],
  );
  Alloc.applyAllocationToLayaway(fakeLayaway, plan);
  assert.strictEqual(fakeLayaway.schedule.installments[0].status, 'PAID');
  assert.strictEqual(fakeLayaway.schedule.installments[1].status, 'PAID');
  assert.strictEqual(fakeLayaway.schedule.installments[2].status, 'PENDING');
  assert.strictEqual(fakeLayaway.aggregates.totalInstallmentsPaid, 200_000);
  assert.strictEqual(fakeLayaway.aggregates.toursPaid, 2);
  assert.strictEqual(fakeLayaway.aggregates.toursRemaining, 1);
  assert.strictEqual(fakeLayaway.aggregates.paidPercentage, 66.67);

  const minNext = Alloc.computeMinimumDue(fakeLayaway);
  assert.strictEqual(minNext.kind, 'TOUR');
  assert.strictEqual(minNext.minimumAmount, 100_000);

  // --- DelayService : grâce 15 j / EN_RETARD / deadline rupture ---
  const DelayService = require('../src/services/layaway/DelayService');

  function buildDelayFixture({
    dueDate,
    status = 'ACTIF',
    grace = 15,
    threshold = 3,
    instStatus = 'PENDING',
  }) {
    return {
      status,
      delays: [],
      appliedParameters: {
        delayGracePeriodDays: grace,
        defaultThresholdMonths: threshold,
      },
      schedule: {
        installments: [
          {
            sequence: 1,
            dueDate: new Date(dueDate),
            amount: 100_000,
            paidAmount: 0,
            remainingAmount: 100_000,
            status: instStatus,
          },
        ],
      },
    };
  }

  // Dans la grâce (due il y a 10 j, grâce 15) → rien
  const inGrace = buildDelayFixture({ dueDate: '2026-09-01T00:00:00.000Z' });
  const evalGrace = DelayService.evaluateLayaway(
    inGrace,
    new Date('2026-09-11T12:00:00.000Z'),
  );
  assert.strictEqual(evalGrace.markedOverdue.length, 0);
  assert.strictEqual(evalGrace.newStatus, null);

  // Après grâce 15 j (due 01/09 → overdue à partir du 17/09) → EN_RETARD
  const pastGrace = buildDelayFixture({ dueDate: '2026-09-01T00:00:00.000Z' });
  const evalOverdue = DelayService.evaluateLayaway(
    pastGrace,
    new Date('2026-09-17T00:00:00.000Z'),
  );
  assert.strictEqual(evalOverdue.markedOverdue.length, 1);
  assert.strictEqual(evalOverdue.newStatus, 'EN_RETARD');
  assert.strictEqual(evalOverdue.shouldBreachDelay, false);
  DelayService.applyEvaluation(
    pastGrace,
    evalOverdue,
    new Date('2026-09-17T00:00:00.000Z'),
  );
  assert.strictEqual(pastGrace.status, 'EN_RETARD');
  assert.strictEqual(pastGrace.schedule.installments[0].status, 'OVERDUE');
  assert.strictEqual(pastGrace.delays.length, 1);

  // Deadline régularisation dépassée → shouldBreachDelay
  const breachCase = buildDelayFixture({
    dueDate: '2026-06-01T00:00:00.000Z',
    status: 'EN_RETARD',
    instStatus: 'OVERDUE',
  });
  breachCase.delays = [
    {
      installmentSequence: 1,
      dueDate: new Date('2026-06-01T00:00:00.000Z'),
      graceEndsAt: new Date('2026-06-16T00:00:00.000Z'),
      overdueAt: new Date('2026-06-17T00:00:00.000Z'),
      status: 'OPEN',
      notifiedOverdueAt: new Date('2026-06-17T00:00:00.000Z'),
      regularizationDeadlineAt: new Date('2026-09-17T00:00:00.000Z'),
    },
  ];
  const evalBreach = DelayService.evaluateLayaway(
    breachCase,
    new Date('2026-09-17T00:00:00.000Z'),
  );
  assert.strictEqual(evalBreach.shouldBreachDelay, true);
  assert.notStrictEqual(evalBreach.newStatus, 'GELE');

  // Recovery : payer le tour OVERDUE → ACTIF (pas de pénalité)
  const recovery = buildDelayFixture({
    dueDate: '2026-08-01T00:00:00.000Z',
    status: 'EN_RETARD',
    instStatus: 'OVERDUE',
  });
  recovery.delays = [
    {
      installmentSequence: 1,
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
      graceEndsAt: new Date('2026-08-16T00:00:00.000Z'),
      overdueAt: new Date('2026-08-17T00:00:00.000Z'),
      status: 'OPEN',
      resolvedAt: null,
      regularizationDeadlineAt: new Date('2026-11-17T00:00:00.000Z'),
    },
  ];
  recovery.schedule.installments[0].status = 'PAID';
  recovery.schedule.installments[0].paidAmount = 100_000;
  recovery.schedule.installments[0].remainingAmount = 0;
  const resolved = DelayService.resolveDelaysAfterPayment(
    recovery,
    new Date('2026-09-20T00:00:00.000Z'),
  );
  assert.strictEqual(resolved.resolved, 1);
  assert.strictEqual(resolved.statusChanged, true);
  assert.strictEqual(recovery.status, 'ACTIF');
  assert.strictEqual(recovery.delays[0].status, 'RESOLVED');

  // --- Remise / payout ---
  assert.strictEqual(canTransition('PAIEMENT_COMPLET', 'REMISE_EN_ATTENTE'), true);
  const Delivery = require('../src/services/layaway/LayawayDeliveryService');
  Delivery.assertProofs({
    pvUrl: 'https://cdn/pv.pdf',
    signatureData: 'data:image/png;base64,AAAA' + 'B'.repeat(20),
  });

  const Payout = require('../src/services/layaway/LayawayPayoutService');
  assert.strictEqual(
    Payout.assertPayoutAllowed({
      status: 'REMISE_VALIDEE',
      delivery: { status: 'VALIDATED' },
    }),
    true,
  );

  // --- Retenue 20 % sur tours payés (sans garantie) ---
  const Cancel = require('../src/services/layaway/LayawayCancellationService');
  const breakdown = Cancel.computeRefundBreakdown({
    aggregates: { totalInstallmentsPaid: 1_000_000 },
    appliedParameters: { retentionPercentage: 20 },
    pricing: { currency: 'XOF' },
  });
  assert.strictEqual(breakdown.totalPaid, 1_000_000);
  assert.strictEqual(breakdown.guaranteePaid, 0);
  assert.strictEqual(breakdown.retentionAmount, 200_000);
  assert.strictEqual(breakdown.refundAmount, 800_000);

  // Défaut settings si snapshot absent
  const defaultRet = Cancel.computeRefundBreakdown({
    aggregates: { totalInstallmentsPaid: 500_000 },
    appliedParameters: {},
    pricing: { currency: 'XOF' },
  });
  assert.strictEqual(defaultRet.retentionPercentage, 20);
  assert.strictEqual(defaultRet.retentionAmount, 100_000);

  const zeroPaid = Cancel.computeRefundBreakdown({
    aggregates: { totalInstallmentsPaid: 0 },
    appliedParameters: { retentionPercentage: 20 },
    pricing: { currency: 'XOF' },
  });
  assert.strictEqual(zeroPaid.totalPaid, 0);
  assert.strictEqual(zeroPaid.refundAmount, 0);

  assert.strictEqual(canTransition('ACTIF', 'ANNULATION_DEMANDEE'), true);
  assert.strictEqual(canTransition('ANNULATION_DEMANDEE', 'REMBOURSEMENT_EN_COURS'), true);
  assert.strictEqual(canTransition('REMBOURSEMENT_EN_COURS', 'ANNULE'), true);

  // Breach reasons export
  const Breach = require('../src/services/layaway/LayawayBreachService');
  assert.strictEqual(Breach.BREACH_REASONS.DELAY_WINDOW_EXPIRED, 'DELAY_WINDOW_EXPIRED');
  assert.strictEqual(Breach.BREACH_REASONS.SCHEDULE_ENDED_UNPAID, 'SCHEDULE_ENDED_UNPAID');

  console.log(
    'Layaway schedule / tours / state-machine / allocation / delays / breach / cancel tests passed ✅',
  );
}

try {
  run();
  process.exit(0);
} catch (error) {
  console.error('Layaway schedule tests failed ❌');
  console.error(error);
  process.exit(1);
}
