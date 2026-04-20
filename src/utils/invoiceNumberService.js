const InvoiceSequence = require('../models/InvoiceSequence');

async function nextInvoiceNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const key = `FAC-${y}${m}${d}`;

  const seqDoc = await InvoiceSequence.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 }, $set: { updatedAt: new Date() } },
    { upsert: true, new: true }
  );
  const serial = String(seqDoc.seq).padStart(4, '0');
  return `${key}-${serial}`;
}

module.exports = { nextInvoiceNumber };
