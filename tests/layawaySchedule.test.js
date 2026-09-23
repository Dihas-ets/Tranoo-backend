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

  // --- Allocation : refuse moins, accepte plus (surplus → échéances suivantes) ---
  const Alloc = require('../src/services/layaway/LayawayPaymentAllocation');
  const fakeLayaway = {
    guarantee: { amount: 150_000, status: 'PENDING' },
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
  assert.strictEqual(minFirst.minimumAmount, 250_000); // 150k + 100k
  assert.throws(
    () => Alloc.resolvePayableAmount(fakeLayaway, 200_000),
    (err) => err.code === 'LAYAWAY_AMOUNT_BELOW_MINIMUM',
  );
  const over = Alloc.resolvePayableAmount(fakeLayaway, 350_000);
  assert.strictEqual(over.amount, 350_000);
  const plan = Alloc.planAllocation(fakeLayaway, 350_000);
  assert.strictEqual(plan.guaranteeAmount, 150_000);
  assert.strictEqual(plan.installmentAmount, 200_000); // échéances 1 + 2
  assert.deepStrictEqual(
    plan.allocations.map((a) => [a.sequence, a.amount]),
    [
      [1, 100_000],
      [2, 100_000],
    ],
  );
  Alloc.applyAllocationToLayaway(fakeLayaway, plan);
  assert.strictEqual(fakeLayaway.guarantee.status, 'PAID');
  assert.strictEqual(fakeLayaway.schedule.installments[0].status, 'PAID');
  assert.strictEqual(fakeLayaway.schedule.installments[1].status, 'PAID');
  assert.strictEqual(fakeLayaway.schedule.installments[2].status, 'PENDING');
  assert.strictEqual(fakeLayaway.aggregates.totalInstallmentsPaid, 200_000);
  assert.strictEqual(fakeLayaway.aggregates.paidPercentage, 66.67);

  // Paiement suivant : min = échéance 3 seule
  const minNext = Alloc.computeMinimumDue(fakeLayaway);
  assert.strictEqual(minNext.kind, 'INSTALLMENT');
  assert.strictEqual(minNext.minimumAmount, 100_000);

  // --- DelayService : grâce / EN_RETARD / GELE / recovery ---
  const DelayService = require('../src/services/layaway/DelayService');

  function buildDelayFixture({ dueDate, status = 'ACTIF', grace = 10, threshold = 3, instStatus = 'PENDING' }) {
    return {
      status,
      notifiedFrozenAt: null,
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

  // Dans la grâce (due il y a 5 j, grâce 10) → rien
  const inGrace = buildDelayFixture({ dueDate: '2026-09-01T00:00:00.000Z' });
  const evalGrace = DelayService.evaluateLayaway(
    inGrace,
    new Date('2026-09-06T12:00:00.000Z'),
  );
  assert.strictEqual(evalGrace.markedOverdue.length, 0);
  assert.strictEqual(evalGrace.newStatus, null);

  // Après grâce (due 01/09, grâce 10 → overdue à partir du 12/09) → EN_RETARD
  const pastGrace = buildDelayFixture({ dueDate: '2026-09-01T00:00:00.000Z' });
  const evalOverdue = DelayService.evaluateLayaway(
    pastGrace,
    new Date('2026-09-12T00:00:00.000Z'),
  );
  assert.strictEqual(evalOverdue.markedOverdue.length, 1);
  assert.strictEqual(evalOverdue.newStatus, 'EN_RETARD');
  const appliedOverdue = DelayService.applyEvaluation(
    pastGrace,
    evalOverdue,
    new Date('2026-09-12T00:00:00.000Z'),
  );
  assert.strictEqual(pastGrace.status, 'EN_RETARD');
  assert.strictEqual(pastGrace.schedule.installments[0].status, 'OVERDUE');
  assert.strictEqual(pastGrace.delays.length, 1);
  assert.strictEqual(pastGrace.delays[0].status, 'OPEN');
  assert.strictEqual(appliedOverdue.installmentsMarked, 1);

  // Seuil gel : due 01/06 + 3 mois = 01/09 → GELE le 01/09
  const freezeCase = buildDelayFixture({
    dueDate: '2026-06-01T00:00:00.000Z',
    status: 'EN_RETARD',
    instStatus: 'OVERDUE',
  });
  const evalFreeze = DelayService.evaluateLayaway(
    freezeCase,
    new Date('2026-09-01T00:00:00.000Z'),
  );
  assert.strictEqual(evalFreeze.newStatus, 'GELE');
  DelayService.applyEvaluation(
    freezeCase,
    evalFreeze,
    new Date('2026-09-01T00:00:00.000Z'),
  );
  assert.strictEqual(freezeCase.status, 'GELE');
  assert.ok(freezeCase.frozenAt);

  // Recovery : payer l'échéance OVERDUE → ACTIF
  const recovery = buildDelayFixture({
    dueDate: '2026-08-01T00:00:00.000Z',
    status: 'EN_RETARD',
    instStatus: 'OVERDUE',
  });
  recovery.delays = [
    {
      installmentSequence: 1,
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
      graceEndsAt: new Date('2026-08-11T00:00:00.000Z'),
      overdueAt: new Date('2026-08-12T00:00:00.000Z'),
      status: 'OPEN',
      resolvedAt: null,
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

  // --- Phase 5 : transitions remise / clôture + gate payout ---
  assert.strictEqual(canTransition('PAIEMENT_COMPLET', 'REMISE_EN_ATTENTE'), true);
  assert.strictEqual(canTransition('REMISE_EN_ATTENTE', 'REMISE_VALIDEE'), true);
  assert.strictEqual(canTransition('REMISE_VALIDEE', 'CLOTURE'), true);
  assert.strictEqual(canTransition('PAIEMENT_COMPLET', 'CLOTURE'), false);
  transition('PAIEMENT_COMPLET', 'REMISE_EN_ATTENTE');
  transition('REMISE_EN_ATTENTE', 'REMISE_VALIDEE');
  transition('REMISE_VALIDEE', 'CLOTURE');

  const Delivery = require('../src/services/layaway/LayawayDeliveryService');
  assert.throws(
    () => Delivery.assertProofs({ pvUrl: null, signatureData: 'x'.repeat(25) }),
    (err) => err.code === 'LAYAWAY_DELIVERY_PV_REQUIRED',
  );
  assert.throws(
    () => Delivery.assertProofs({ pvUrl: 'https://cdn/pv.pdf', signatureData: '' }),
    (err) => err.code === 'LAYAWAY_DELIVERY_PV_SIGNATURE_REQUIRED',
  );
  assert.throws(
    () => Delivery.assertProofs({ pvUrl: 'https://cdn/pv.pdf', signatureData: 'short' }),
    (err) => err.code === 'LAYAWAY_DELIVERY_PV_SIGNATURE_INVALID',
  );
  Delivery.assertProofs({
    pvUrl: 'https://cdn/pv.pdf',
    signatureData: 'data:image/png;base64,AAAA' + 'B'.repeat(20),
  });

  const Payout = require('../src/services/layaway/LayawayPayoutService');
  assert.throws(
    () =>
      Payout.assertPayoutAllowed({
        status: 'REMISE_EN_ATTENTE',
        delivery: { status: 'SUBMITTED' },
      }),
    (err) => err.code === 'LAYAWAY_PAYOUT_BLOCKED',
  );
  assert.throws(
    () =>
      Payout.assertPayoutAllowed({
        status: 'REMISE_VALIDEE',
        delivery: { status: 'SUBMITTED' },
      }),
    (err) => err.code === 'LAYAWAY_PAYOUT_BLOCKED',
  );
  assert.strictEqual(
    Payout.assertPayoutAllowed({
      status: 'REMISE_VALIDEE',
      delivery: { status: 'VALIDATED' },
    }),
    true,
  );
  assert.strictEqual(
    Payout.assertPayoutAllowed({
      status: 'CLOTURE',
      delivery: { status: 'VALIDATED' },
    }),
    true,
  );

  // --- Phase 6 : retenue / transitions annulation ---
  const Cancel = require('../src/services/layaway/LayawayCancellationService');
  const breakdown = Cancel.computeRefundBreakdown({
    guarantee: { amount: 150_000, status: 'PAID' },
    aggregates: { totalInstallmentsPaid: 850_000 },
    appliedParameters: { retentionPercentage: 5 },
    pricing: { currency: 'XOF' },
  });
  assert.strictEqual(breakdown.totalPaid, 1_000_000);
  assert.strictEqual(breakdown.retentionAmount, 50_000);
  assert.strictEqual(breakdown.refundAmount, 950_000);

  const zeroPaid = Cancel.computeRefundBreakdown({
    guarantee: { amount: 150_000, status: 'PENDING' },
    aggregates: { totalInstallmentsPaid: 0 },
    appliedParameters: { retentionPercentage: 5 },
    pricing: { currency: 'XOF' },
  });
  assert.strictEqual(zeroPaid.totalPaid, 0);
  assert.strictEqual(zeroPaid.refundAmount, 0);

  assert.strictEqual(canTransition('ACTIF', 'ANNULATION_DEMANDEE'), true);
  assert.strictEqual(canTransition('ANNULATION_DEMANDEE', 'REMBOURSEMENT_EN_COURS'), true);
  assert.strictEqual(canTransition('REMBOURSEMENT_EN_COURS', 'ANNULE'), true);
  assert.strictEqual(canTransition('ANNULATION_DEMANDEE', 'CONTRAT_SIGNE'), true);
  assert.strictEqual(canTransition('ANNULATION_DEMANDEE', 'GELE'), true);
  assert.strictEqual(canTransition('PAIEMENT_COMPLET', 'ANNULATION_DEMANDEE'), false);
  transition('ACTIF', 'ANNULATION_DEMANDEE');
  transition('ANNULATION_DEMANDEE', 'REMBOURSEMENT_EN_COURS');
  transition('REMBOURSEMENT_EN_COURS', 'ANNULE');

  console.log(
    'Layaway schedule / guarantee / state-machine / allocation / delays / completion / cancel tests passed ✅',
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
