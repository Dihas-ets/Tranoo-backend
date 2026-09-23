/**
 * Détection retards / gel Layaway (Phase 4).
 *
 * Règles MVP :
 * - Grâce : `appliedParameters.delayGracePeriodDays` (défaut 10).
 *   Après dueDate + grâce → échéance OVERDUE + dossier EN_RETARD.
 * - Gel : `appliedParameters.defaultThresholdMonths` (défaut 3).
 *   Si l’échéance OPEN en retard la plus ancienne a dueDate + N mois ≤ now → GELE.
 *
 * TODO métier (§7) : workflow exact post-gel, ops autorisées sur GELE
 * (paiements actuellement refusés — voir LayawayPaymentService.assertPayable).
 */

const Layaway = require('../../models/Layaway');
const Notification = require('../../models/Notification');
const { transition } = require('./LayawayStateMachine');
const { addUtcMonthsClamped } = require('./ScheduleService');
const { DEFAULTS } = require('../../models/LayawaySettings');

const OPEN_INSTALLMENT_STATUSES = new Set([
  'PENDING',
  'PARTIALLY_PAID',
  'OVERDUE',
]);

const DELAY_SCAN_STATUSES = ['ACTIF', 'EN_RETARD'];

function startOfUtcDay(date) {
  const d = new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetweenUtc(from, to) {
  const a = startOfUtcDay(from).getTime();
  const b = startOfUtcDay(to).getTime();
  return Math.floor((b - a) / 86_400_000);
}

function resolveGraceDays(layaway) {
  const n = Number(layaway?.appliedParameters?.delayGracePeriodDays);
  if (Number.isFinite(n) && n >= 0) return n;
  return DEFAULTS.delayGracePeriodDays;
}

function resolveThresholdMonths(layaway) {
  const n = Number(layaway?.appliedParameters?.defaultThresholdMonths);
  if (Number.isFinite(n) && n > 0) return n;
  return DEFAULTS.defaultThresholdMonths;
}

function installmentRemaining(inst) {
  if (!inst) return 0;
  if (inst.remainingAmount != null) return Math.max(0, Number(inst.remainingAmount) || 0);
  return Math.max(0, (Number(inst.amount) || 0) - (Number(inst.paidAmount) || 0));
}

function graceEndsAt(dueDate, graceDays) {
  const start = startOfUtcDay(dueDate);
  return new Date(start.getTime() + graceDays * 86_400_000);
}

/**
 * Évalue un dossier sans I/O (testable).
 * @returns {{
 *   markedOverdue: Array<{ sequence: number, dueDate: Date, graceEndsAt: Date }>,
 *   newStatus: string|null,
 *   shouldNotifyOverdue: boolean,
 *   shouldNotifyFrozen: boolean,
 *   oldestOverdueDueDate: Date|null,
 * }}
 */
function evaluateLayaway(layaway, now = new Date()) {
  const today = startOfUtcDay(now);
  const graceDays = resolveGraceDays(layaway);
  const thresholdMonths = resolveThresholdMonths(layaway);
  const installments = layaway?.schedule?.installments || [];

  const markedOverdue = [];
  let oldestOverdueDueDate = null;

  for (const inst of installments) {
    if (!OPEN_INSTALLMENT_STATUSES.has(inst.status)) continue;
    if (installmentRemaining(inst) <= 0) continue;

    const due = new Date(inst.dueDate);
    const daysPast = daysBetweenUtc(due, today);
    if (daysPast <= graceDays) continue;

    // Past grace → overdue
    if (inst.status !== 'OVERDUE') {
      markedOverdue.push({
        sequence: inst.sequence,
        dueDate: due,
        graceEndsAt: graceEndsAt(due, graceDays),
        installmentId: inst._id || null,
      });
    }

    if (!oldestOverdueDueDate || due < oldestOverdueDueDate) {
      oldestOverdueDueDate = due;
    }
  }

  // Also consider already-OVERDUE installments for freeze / status
  for (const inst of installments) {
    if (inst.status !== 'OVERDUE') continue;
    if (installmentRemaining(inst) <= 0) continue;
    const due = new Date(inst.dueDate);
    if (!oldestOverdueDueDate || due < oldestOverdueDueDate) {
      oldestOverdueDueDate = due;
    }
  }

  const hasOverdue =
    oldestOverdueDueDate != null ||
    markedOverdue.length > 0 ||
    installments.some(
      (i) => i.status === 'OVERDUE' && installmentRemaining(i) > 0,
    );

  let newStatus = null;
  let shouldNotifyFrozen = false;
  let shouldNotifyOverdue = false;

  const current = layaway.status;

  if (
    hasOverdue &&
    oldestOverdueDueDate &&
    (current === 'ACTIF' || current === 'EN_RETARD')
  ) {
    const freezeAt = addUtcMonthsClamped(oldestOverdueDueDate, thresholdMonths);
    if (startOfUtcDay(freezeAt).getTime() <= today.getTime()) {
      if (current !== 'GELE') {
        newStatus = 'GELE';
        shouldNotifyFrozen = !layaway.notifiedFrozenAt;
      }
    } else if (current === 'ACTIF') {
      newStatus = 'EN_RETARD';
      shouldNotifyOverdue = true;
    }
  } else if (hasOverdue && current === 'ACTIF') {
    newStatus = 'EN_RETARD';
    shouldNotifyOverdue = true;
  }

  // First time marking overdue while already EN_RETARD → still notify if no open delay notifs
  if (
    markedOverdue.length > 0 &&
    current === 'EN_RETARD' &&
    newStatus !== 'GELE'
  ) {
    const hasOpenNotified = (layaway.delays || []).some(
      (d) => d.status === 'OPEN' && d.notifiedOverdueAt,
    );
    if (!hasOpenNotified) shouldNotifyOverdue = true;
  }

  return {
    markedOverdue,
    newStatus,
    shouldNotifyOverdue,
    shouldNotifyFrozen,
    oldestOverdueDueDate,
    graceDays,
    thresholdMonths,
  };
}

/**
 * Applique le résultat d'évaluation sur le document (mutation in-place).
 */
function applyEvaluation(layaway, evaluation, now = new Date()) {
  const changes = {
    installmentsMarked: 0,
    delaysOpened: 0,
    statusFrom: layaway.status,
    statusTo: layaway.status,
  };

  if (!evaluation) return changes;

  const bySeq = new Map(
    (layaway.schedule?.installments || []).map((i) => [i.sequence, i]),
  );

  if (!Array.isArray(layaway.delays)) layaway.delays = [];

  for (const item of evaluation.markedOverdue || []) {
    const inst = bySeq.get(item.sequence);
    if (inst && inst.status !== 'OVERDUE' && inst.status !== 'PAID') {
      inst.status = 'OVERDUE';
      changes.installmentsMarked += 1;
    }

    const alreadyOpen = layaway.delays.some(
      (d) =>
        d.status === 'OPEN' &&
        Number(d.installmentSequence) === Number(item.sequence),
    );
    if (!alreadyOpen) {
      layaway.delays.push({
        installmentSequence: item.sequence,
        installmentId: item.installmentId || inst?._id || null,
        dueDate: item.dueDate,
        graceEndsAt: item.graceEndsAt,
        overdueAt: now,
        resolvedAt: null,
        status: 'OPEN',
        notifiedOverdueAt: null,
      });
      changes.delaysOpened += 1;
    }
  }

  if (evaluation.newStatus && evaluation.newStatus !== layaway.status) {
    transition(layaway.status, evaluation.newStatus);
    layaway.status = evaluation.newStatus;
    changes.statusTo = evaluation.newStatus;
    if (evaluation.newStatus === 'GELE') {
      layaway.frozenAt = now;
    }
  }

  return changes;
}

/**
 * Après paiement : clôture les delays des échéances soldées ;
 * EN_RETARD → ACTIF s'il ne reste plus d'OVERDUE.
 */
function resolveDelaysAfterPayment(layaway, now = new Date()) {
  const installments = layaway?.schedule?.installments || [];
  const paidSequences = new Set(
    installments
      .filter((i) => i.status === 'PAID' || installmentRemaining(i) <= 0)
      .map((i) => i.sequence),
  );

  let resolved = 0;
  for (const delay of layaway.delays || []) {
    if (delay.status !== 'OPEN') continue;
    if (paidSequences.has(delay.installmentSequence)) {
      delay.status = 'RESOLVED';
      delay.resolvedAt = now;
      resolved += 1;
    }
  }

  const stillOverdue = installments.some(
    (i) => i.status === 'OVERDUE' && installmentRemaining(i) > 0,
  );

  let statusChanged = false;
  if (layaway.status === 'EN_RETARD' && !stillOverdue) {
    transition('EN_RETARD', 'ACTIF');
    layaway.status = 'ACTIF';
    statusChanged = true;
  }

  return { resolved, statusChanged, status: layaway.status };
}

async function notifyBuyer(layaway, kind) {
  const buyerId = layaway.buyerId;
  if (!buyerId) return null;

  const titles = {
    OVERDUE: 'Layaway — échéance en retard',
    FROZEN: 'Layaway — dossier gelé',
  };
  const messages = {
    OVERDUE:
      'Une ou plusieurs échéances de votre dossier Layaway sont en retard après la période de grâce. Régularisez pour éviter le gel du dossier.',
    FROZEN:
      'Votre dossier Layaway a été gelé suite à un défaut prolongé. Contactez le support Tranoo.',
  };

  try {
    const notif = await Notification.create({
      recipient: buyerId,
      sender: 'system',
      title: titles[kind] || 'Layaway',
      message: messages[kind] || '',
      type: 'paiement',
      relatedId: layaway._id,
      relatedModel: 'Layaway',
      data: {
        layawayId: String(layaway._id),
        kind,
        status: layaway.status,
      },
    });
    return notif;
  } catch (err) {
    console.error('[LAYAWAY][DELAY] Notification échouée:', err.message);
    return null;
  }
}

/**
 * Traite un dossier chargé (save + notifs).
 */
async function processLayawayDocument(layaway, now = new Date()) {
  const evaluation = evaluateLayaway(layaway, now);
  const changes = applyEvaluation(layaway, evaluation, now);

  let notified = [];
  if (evaluation.shouldNotifyOverdue) {
    const n = await notifyBuyer(layaway, 'OVERDUE');
    if (n) {
      notified.push('OVERDUE');
      const openDelays = (layaway.delays || []).filter((d) => d.status === 'OPEN');
      for (const d of openDelays) {
        if (!d.notifiedOverdueAt) d.notifiedOverdueAt = now;
      }
    }
  }
  if (evaluation.shouldNotifyFrozen) {
    const n = await notifyBuyer(layaway, 'FROZEN');
    if (n) {
      notified.push('FROZEN');
      layaway.notifiedFrozenAt = now;
    }
  }

  const touched =
    changes.installmentsMarked > 0 ||
    changes.delaysOpened > 0 ||
    changes.statusFrom !== changes.statusTo ||
    notified.length > 0;

  if (touched) {
    await layaway.save();
  }

  return { evaluation, changes, notified, touched };
}

/**
 * Cron : scan des dossiers ACTIF / EN_RETARD avec échéances dues.
 */
async function processDueLayaways(now = new Date()) {
  const today = startOfUtcDay(now);
  const dossiers = await Layaway.find({
    status: { $in: DELAY_SCAN_STATUSES },
    'schedule.installments': {
      $elemMatch: {
        status: { $in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
        remainingAmount: { $gt: 0 },
        dueDate: { $lt: today },
      },
    },
  });

  const summary = {
    scanned: dossiers.length,
    updated: 0,
    markedOverdue: 0,
    toEnRetard: 0,
    toGele: 0,
    notified: 0,
    errors: [],
  };

  for (const layaway of dossiers) {
    try {
      const result = await processLayawayDocument(layaway, now);
      if (result.touched) summary.updated += 1;
      summary.markedOverdue += result.changes.installmentsMarked;
      if (result.changes.statusTo === 'EN_RETARD' && result.changes.statusFrom === 'ACTIF') {
        summary.toEnRetard += 1;
      }
      if (result.changes.statusTo === 'GELE') summary.toGele += 1;
      summary.notified += result.notified.length;
    } catch (err) {
      console.error(`[LAYAWAY][DELAY] Erreur dossier ${layaway._id}:`, err.message);
      summary.errors.push({ layawayId: String(layaway._id), message: err.message });
    }
  }

  return summary;
}

module.exports = {
  evaluateLayaway,
  applyEvaluation,
  resolveDelaysAfterPayment,
  processLayawayDocument,
  processDueLayaways,
  startOfUtcDay,
  daysBetweenUtc,
  graceEndsAt,
  resolveGraceDays,
  resolveThresholdMonths,
  DELAY_SCAN_STATUSES,
};
