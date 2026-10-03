/**
 * Détection retards Layaway (logique finalisée).
 *
 * - Grâce : delayGracePeriodDays (défaut 15) après dueDate.
 * - Après grâce : OVERDUE + EN_RETARD + notification.
 * - À la notif : regularizationDeadlineAt = notifiedAt + defaultThresholdMonths (3).
 * - Pendant la fenêtre : paiements autorisés ; régularisation → ACTIF, pas de pénalité.
 * - Après deadline sans régularisation → rupture auto (DELAY_WINDOW_EXPIRED).
 * - Fin échéancier (endDate) + solde > 0 → rupture auto (SCHEDULE_ENDED_UNPAID).
 */

const Layaway = require('../../models/Layaway');
const Notification = require('../../models/Notification');
const { transition } = require('./LayawayStateMachine');
const { addUtcMonthsClamped } = require('./ScheduleService');
const { DEFAULTS } = require('../../models/LayawaySettings');
const { applyBreach, BREACH_REASONS } = require('./LayawayBreachService');

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
 * Ne déclenche plus de GELE — la rupture est gérée séparément via deadline.
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
  let shouldNotifyOverdue = false;

  const current = layaway.status;

  if (hasOverdue && (current === 'ACTIF' || current === 'EN_RETARD')) {
    if (current === 'ACTIF') {
      newStatus = 'EN_RETARD';
      shouldNotifyOverdue = true;
    }
  }

  if (
    markedOverdue.length > 0 &&
    current === 'EN_RETARD' &&
    newStatus !== 'ANNULE'
  ) {
    const hasOpenNotified = (layaway.delays || []).some(
      (d) => d.status === 'OPEN' && d.notifiedOverdueAt,
    );
    if (!hasOpenNotified) shouldNotifyOverdue = true;
  }

  // Deadline de régularisation dépassée ?
  let shouldBreachDelay = false;
  const openDelays = (layaway.delays || []).filter((d) => d.status === 'OPEN');
  for (const d of openDelays) {
    if (d.regularizationDeadlineAt) {
      if (startOfUtcDay(d.regularizationDeadlineAt).getTime() <= today.getTime()) {
        shouldBreachDelay = true;
        break;
      }
    }
  }

  return {
    markedOverdue,
    newStatus,
    shouldNotifyOverdue,
    shouldNotifyFrozen: false,
    shouldBreachDelay,
    oldestOverdueDueDate,
    graceDays,
    thresholdMonths,
  };
}

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
        regularizationDeadlineAt: null,
      });
      changes.delaysOpened += 1;
    }
  }

  if (
    evaluation.newStatus &&
    evaluation.newStatus !== layaway.status &&
    evaluation.newStatus !== 'GELE'
  ) {
    transition(layaway.status, evaluation.newStatus);
    layaway.status = evaluation.newStatus;
    changes.statusTo = evaluation.newStatus;
  }

  return changes;
}

/**
 * Après paiement : clôture les delays des tours soldés ;
 * EN_RETARD → ACTIF s'il ne reste plus d'OVERDUE. Pas de pénalité récidive.
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

async function notifyBuyerOverdue(layaway, deadlineAt) {
  const buyerId = layaway.buyerId;
  if (!buyerId) return null;

  const deadlineStr = deadlineAt
    ? new Date(deadlineAt).toISOString().slice(0, 10)
    : '';

  try {
    return await Notification.create({
      recipient: buyerId,
      sender: 'system',
      title: 'Layaway — échéance en retard',
      message:
        'Une ou plusieurs échéances de votre dossier Layaway sont en retard après le délai de grâce. ' +
        `Vous disposez de 3 mois à compter de cette notification${deadlineStr ? ` (jusqu’au ${deadlineStr})` : ''} pour régulariser. ` +
        'Passé ce délai, le contrat sera rompu et Tranoo conservera la retenue paramétrée.',
      type: 'paiement',
      relatedId: layaway._id,
      relatedModel: 'Layaway',
      data: {
        layawayId: String(layaway._id),
        kind: 'OVERDUE',
        status: layaway.status,
        regularizationDeadlineAt: deadlineAt || null,
      },
    });
  } catch (err) {
    console.error('[LAYAWAY][DELAY] Notification échouée:', err.message);
    return null;
  }
}

async function processLayawayDocument(layaway, now = new Date()) {
  const evaluation = evaluateLayaway(layaway, now);
  const changes = applyEvaluation(layaway, evaluation, now);

  let notified = [];
  let breached = false;

  if (evaluation.shouldNotifyOverdue) {
    const thresholdMonths = evaluation.thresholdMonths;
    const deadline = addUtcMonthsClamped(now, thresholdMonths);
    const n = await notifyBuyerOverdue(layaway, deadline);
    if (n) {
      notified.push('OVERDUE');
      const openDelays = (layaway.delays || []).filter((d) => d.status === 'OPEN');
      for (const d of openDelays) {
        if (!d.notifiedOverdueAt) {
          d.notifiedOverdueAt = now;
          d.regularizationDeadlineAt = deadline;
        }
      }
    }
  }

  // Re-évaluer breach après éventuelle pose de deadlines
  const reEval = evaluateLayaway(layaway, now);
  if (reEval.shouldBreachDelay && !layaway.breach?.breachedAt) {
    await layaway.save();
    await applyBreach(layaway, BREACH_REASONS.DELAY_WINDOW_EXPIRED, now);
    breached = true;
    return {
      evaluation: reEval,
      changes: { ...changes, statusTo: 'ANNULE' },
      notified,
      touched: true,
      breached: true,
    };
  }

  const touched =
    changes.installmentsMarked > 0 ||
    changes.delaysOpened > 0 ||
    changes.statusFrom !== changes.statusTo ||
    notified.length > 0;

  if (touched && !breached) {
    await layaway.save();
  }

  return { evaluation, changes, notified, touched, breached };
}

/**
 * Fin d'échéancier sans objectif atteint → rupture.
 */
async function processScheduleEndedBreaches(now = new Date()) {
  const today = startOfUtcDay(now);
  const dossiers = await Layaway.find({
    status: { $in: DELAY_SCAN_STATUSES },
    'schedule.endDate': { $lt: today },
    'aggregates.remainingScheduleBalance': { $gt: 0 },
    'breach.breachedAt': null,
  });

  const summary = {
    scanned: dossiers.length,
    breached: 0,
    errors: [],
  };

  for (const layaway of dossiers) {
    try {
      const remaining =
        layaway.aggregates?.remainingScheduleBalance ??
        (layaway.schedule?.installments || []).reduce(
          (acc, i) => acc + installmentRemaining(i),
          0,
        );
      if (remaining <= 0) continue;
      await applyBreach(layaway, BREACH_REASONS.SCHEDULE_ENDED_UNPAID, now);
      summary.breached += 1;
    } catch (err) {
      console.error(
        `[LAYAWAY][BREACH][SCHEDULE] Erreur dossier ${layaway._id}:`,
        err.message,
      );
      summary.errors.push({ layawayId: String(layaway._id), message: err.message });
    }
  }

  return summary;
}

/**
 * Cron : scan retards + ruptures (délai / fin échéancier).
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

  // Aussi dossiers EN_RETARD avec deadline proche (même sans dueDate récente)
  const withDeadline = await Layaway.find({
    status: 'EN_RETARD',
    'delays': {
      $elemMatch: {
        status: 'OPEN',
        regularizationDeadlineAt: { $lte: today },
      },
    },
  });

  const byId = new Map();
  for (const d of [...dossiers, ...withDeadline]) {
    byId.set(String(d._id), d);
  }

  const summary = {
    scanned: byId.size,
    updated: 0,
    markedOverdue: 0,
    toEnRetard: 0,
    toGele: 0,
    breached: 0,
    scheduleBreached: 0,
    notified: 0,
    errors: [],
  };

  for (const layaway of byId.values()) {
    try {
      const result = await processLayawayDocument(layaway, now);
      if (result.touched) summary.updated += 1;
      summary.markedOverdue += result.changes.installmentsMarked;
      if (result.changes.statusTo === 'EN_RETARD' && result.changes.statusFrom === 'ACTIF') {
        summary.toEnRetard += 1;
      }
      if (result.breached) summary.breached += 1;
      summary.notified += result.notified.length;
    } catch (err) {
      console.error(`[LAYAWAY][DELAY] Erreur dossier ${layaway._id}:`, err.message);
      summary.errors.push({ layawayId: String(layaway._id), message: err.message });
    }
  }

  try {
    const scheduleResult = await processScheduleEndedBreaches(now);
    summary.scheduleBreached = scheduleResult.breached;
    summary.errors.push(...scheduleResult.errors);
  } catch (err) {
    console.error('[LAYAWAY][BREACH][SCHEDULE] Scan échoué:', err.message);
    summary.errors.push({ layawayId: null, message: err.message });
  }

  return summary;
}

module.exports = {
  evaluateLayaway,
  applyEvaluation,
  resolveDelaysAfterPayment,
  processLayawayDocument,
  processDueLayaways,
  processScheduleEndedBreaches,
  startOfUtcDay,
  daysBetweenUtc,
  graceEndsAt,
  resolveGraceDays,
  resolveThresholdMonths,
  DELAY_SCAN_STATUSES,
};
