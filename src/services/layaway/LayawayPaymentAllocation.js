/**
 * Allocation des paiements Layaway.
 * Règle : on refuse un montant < minimum dû ;
 * un surplus est appliqué aux échéances suivantes (dans l'ordre).
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

/**
 * Prochaine échéance non soldée (PENDING / PARTIALLY_PAID / OVERDUE), par sequence.
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

function unpaidGuarantee(layaway) {
  if (!layaway?.guarantee) return 0;
  if (layaway.guarantee.status === 'PAID') return 0;
  return Math.max(0, roundXof(layaway.guarantee.amount));
}

/**
 * Minimum accepté pour un paiement.
 * - Premier règlement (garantie non payée) : garantie + 1ère échéance restante
 * - Ensuite : montant restant de la prochaine échéance ouverte
 */
function computeMinimumDue(layaway) {
  const g = unpaidGuarantee(layaway);
  const next = getNextOpenInstallment(layaway.schedule?.installments);
  const nextRem = installmentRemaining(next);

  if (g > 0) {
    // Premier règlement : garantie + première échéance
    return {
      minimumAmount: g + nextRem,
      guaranteeDue: g,
      installmentDue: nextRem,
      targetInstallmentSequence: next?.sequence ?? null,
      kind: 'FIRST',
    };
  }

  if (!next || nextRem <= 0) {
    return {
      minimumAmount: 0,
      guaranteeDue: 0,
      installmentDue: 0,
      targetInstallmentSequence: null,
      kind: 'NONE',
    };
  }

  return {
    minimumAmount: nextRem,
    guaranteeDue: 0,
    installmentDue: nextRem,
    targetInstallmentSequence: next.sequence,
    kind: 'INSTALLMENT',
  };
}

/**
 * Plafond = garantie impayée + solde échéancier restant.
 */
function computeMaximumPayable(layaway) {
  const g = unpaidGuarantee(layaway);
  const scheduleRemaining = (layaway.schedule?.installments || []).reduce(
    (acc, inst) => acc + installmentRemaining(inst),
    0,
  );
  return g + scheduleRemaining;
}

/**
 * Valide le montant proposé par l'acheteur.
 * - amount omis → minimum
 * - amount < minimum → rejet
 * - amount > maximum → rejet
 */
function resolvePayableAmount(layaway, requestedAmount) {
  const minInfo = computeMinimumDue(layaway);
  if (minInfo.kind === 'NONE' || minInfo.minimumAmount <= 0) {
    throw paymentAllocError(
      'Aucune échéance à payer sur ce dossier',
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
        guaranteeDue: minInfo.guaranteeDue,
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
 * Répartit un montant confirmé : garantie d'abord, puis échéances dans l'ordre.
 * Ne mute pas le dossier — retourne un plan d'allocation.
 *
 * @returns {{
 *   guaranteeAmount: number,
 *   installmentAmount: number,
 *   allocations: Array<{ sequence: number, amount: number, installmentId?: string }>,
 *   leftover: number
 * }}
 */
function planAllocation(layaway, paidAmount) {
  let remaining = roundXof(paidAmount);
  let guaranteeAmount = 0;
  const allocations = [];

  const gDue = unpaidGuarantee(layaway);
  if (gDue > 0 && remaining > 0) {
    guaranteeAmount = Math.min(gDue, remaining);
    remaining -= guaranteeAmount;
  }

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
    guaranteeAmount,
    installmentAmount: allocations.reduce((a, x) => a + x.amount, 0),
    allocations,
    leftover: remaining,
  };
}

/**
 * Applique le plan sur le document Layaway (mutation in-place, non sauvegardée).
 */
function applyAllocationToLayaway(layaway, plan, paidAt = new Date()) {
  if (plan.guaranteeAmount > 0) {
    layaway.guarantee.status = 'PAID';
    layaway.guarantee.paidAt = paidAt;
  }

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
  layaway.aggregates.totalInstallmentsPaid = totalPaid;
  layaway.aggregates.remainingScheduleBalance = Math.max(0, totalAmount - totalPaid);
  layaway.aggregates.paidPercentage =
    totalAmount > 0 ? Math.min(100, Math.round((totalPaid / totalAmount) * 10000) / 100) : 0;

  return {
    allInstallmentsPaid: layaway.aggregates.remainingScheduleBalance === 0,
    totalInstallmentsPaid: totalPaid,
    paidPercentage: layaway.aggregates.paidPercentage,
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
