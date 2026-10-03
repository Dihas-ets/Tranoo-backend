/**
 * Allocation des paiements Layaway (tours / installments uniquement).
 * Règle : on refuse un montant < minimum dû (prochain tour) ;
 * un surplus est appliqué aux tours suivants (dans l'ordre).
 */

function paymentAllocError(message, code, status = 400, meta) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (meta) err.meta = meta;
  return err;
}

function roundXof(n) {
  return Math.round(Number(n) || 0);
}

function computeTourProgress(installments = []) {
  const list = installments || [];
  const toursPaid = list.filter((i) => i.status === 'PAID').length;
  const toursRemaining = list.filter((i) =>
    ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status),
  ).length;
  return { toursPaid, toursRemaining };
}

/**
 * Prochain tour non soldé (PENDING / PARTIALLY_PAID / OVERDUE), par sequence.
 */
function getNextOpenInstallment(installments) {
  const list = [...(installments || [])].sort((a, b) => a.sequence - b.sequence);
  return (
    list.find((i) =>
      ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'].includes(i.status),
    ) || null
  );
}

function installmentRemaining(inst) {
  if (!inst) return 0;
  if (inst.remainingAmount != null) return Math.max(0, roundXof(inst.remainingAmount));
  const paid = roundXof(inst.paidAmount);
  return Math.max(0, roundXof(inst.amount) - paid);
}

/** @deprecated Garantie retirée — toujours 0 */
function unpaidGuarantee() {
  return 0;
}

/**
 * Minimum accepté = montant restant du prochain tour ouvert.
 */
function computeMinimumDue(layaway) {
  const next = getNextOpenInstallment(layaway.schedule?.installments);
  const nextRem = installmentRemaining(next);

  if (!next || nextRem <= 0) {
    return {
      minimumAmount: 0,
      guaranteeDue: 0,
      installmentDue: 0,
      targetInstallmentSequence: null,
      kind: 'NONE',
    };
  }

  const isFirstTour = next.sequence === 1 && roundXof(next.paidAmount) === 0;

  return {
    minimumAmount: nextRem,
    guaranteeDue: 0,
    installmentDue: nextRem,
    targetInstallmentSequence: next.sequence,
    kind: isFirstTour ? 'FIRST_TOUR' : 'TOUR',
  };
}

/**
 * Plafond = solde échéancier restant.
 */
function computeMaximumPayable(layaway) {
  return (layaway.schedule?.installments || []).reduce(
    (acc, inst) => acc + installmentRemaining(inst),
    0,
  );
}

/**
 * Valide le montant proposé par l'acheteur.
 */
function resolvePayableAmount(layaway, requestedAmount) {
  const minInfo = computeMinimumDue(layaway);
  if (minInfo.kind === 'NONE' || minInfo.minimumAmount <= 0) {
    throw paymentAllocError(
      'Aucun tour à payer sur ce dossier',
      'LAYAWAY_NOTHING_TO_PAY',
      409,
    );
  }

  const maxAmount = computeMaximumPayable(layaway);
  let amount;
  if (requestedAmount === undefined || requestedAmount === null || requestedAmount === '') {
    amount = minInfo.minimumAmount;
  } else {
    amount = roundXof(requestedAmount);
    if (!Number.isFinite(amount)) {
      throw paymentAllocError('Montant invalide', 'LAYAWAY_INVALID_AMOUNT');
    }
  }

  if (amount < minInfo.minimumAmount) {
    throw paymentAllocError(
      `Montant insuffisant : minimum ${minInfo.minimumAmount} FCFA`,
      'LAYAWAY_AMOUNT_BELOW_MINIMUM',
      400,
      {
        minimumAmount: minInfo.minimumAmount,
        requestedAmount: amount,
        installmentDue: minInfo.installmentDue,
      },
    );
  }

  if (amount > maxAmount) {
    throw paymentAllocError(
      `Montant supérieur au solde restant (${maxAmount} FCFA)`,
      'LAYAWAY_AMOUNT_ABOVE_MAXIMUM',
      400,
      { maximumAmount: maxAmount, requestedAmount: amount },
    );
  }

  return { amount, minInfo, maxAmount };
}

/**
 * Répartit un montant confirmé sur les tours dans l'ordre.
 */
function planAllocation(layaway, paidAmount) {
  let remaining = roundXof(paidAmount);
  const allocations = [];

  const installments = [...(layaway.schedule?.installments || [])].sort(
    (a, b) => a.sequence - b.sequence,
  );

  for (const inst of installments) {
    if (remaining <= 0) break;
    const due = installmentRemaining(inst);
    if (due <= 0) continue;
    const take = Math.min(due, remaining);
    allocations.push({
      sequence: inst.sequence,
      amount: take,
      installmentId: inst._id ? String(inst._id) : undefined,
    });
    remaining -= take;
  }

  return {
    guaranteeAmount: 0,
    installmentAmount: allocations.reduce((a, x) => a + x.amount, 0),
    allocations,
    leftover: remaining,
  };
}

/**
 * Applique le plan sur le document Layaway (mutation in-place, non sauvegardée).
 */
function applyAllocationToLayaway(layaway, plan, paidAt = new Date()) {
  const bySeq = new Map(
    (layaway.schedule?.installments || []).map((i) => [i.sequence, i]),
  );

  for (const alloc of plan.allocations) {
    const inst = bySeq.get(alloc.sequence);
    if (!inst) continue;
    const prevPaid = roundXof(inst.paidAmount);
    inst.paidAmount = prevPaid + alloc.amount;
    inst.remainingAmount = Math.max(0, roundXof(inst.amount) - inst.paidAmount);
    if (inst.remainingAmount === 0) {
      inst.status = 'PAID';
      inst.paidAt = paidAt;
    } else if (inst.status === 'OVERDUE') {
      inst.status = 'OVERDUE';
    } else {
      inst.status = 'PARTIALLY_PAID';
    }
  }

  if (!layaway.aggregates) {
    layaway.aggregates = {};
  }

  const totalPaid = (layaway.schedule.installments || []).reduce(
    (acc, i) => acc + roundXof(i.paidAmount),
    0,
  );
  const totalAmount = roundXof(layaway.pricing.totalAmount);
  const tours = computeTourProgress(layaway.schedule.installments);

  layaway.aggregates.totalInstallmentsPaid = totalPaid;
  layaway.aggregates.remainingScheduleBalance = Math.max(0, totalAmount - totalPaid);
  layaway.aggregates.paidPercentage =
    totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 10000) / 100) : 0;
  layaway.aggregates.toursPaid = tours.toursPaid;
  layaway.aggregates.toursRemaining = tours.toursRemaining;

  return {
    allInstallmentsPaid: layaway.aggregates.remainingScheduleBalance === 0,
    totalInstallmentsPaid: totalPaid,
    paidPercentage: layaway.aggregates.paidPercentage,
    toursPaid: tours.toursPaid,
    toursRemaining: tours.toursRemaining,
  };
}

module.exports = {
  computeMinimumDue,
  computeMaximumPayable,
  resolvePayableAmount,
  planAllocation,
  applyAllocationToLayaway,
  getNextOpenInstallment,
  installmentRemaining,
  unpaidGuarantee,
};
