const mongoose = require('mongoose');

const personneInteresseeSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'installment_payment_clicks' },
    personneInteresse: { type: Number, default: 0, min: 0 },
  },
  {
    collection: 'personne_interessee',
    versionKey: false,
  },
);

module.exports = mongoose.model(
  'PersonneInteressee',
  personneInteresseeSchema,
);
