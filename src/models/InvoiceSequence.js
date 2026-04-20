const mongoose = require('mongoose');

const invoiceSequenceSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('InvoiceSequence', invoiceSequenceSchema);
