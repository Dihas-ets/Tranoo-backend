const mongoose = require('mongoose');

const propositionTransitSchema = new mongoose.Schema({
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
  transitaire: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  montant: { type: Number, required: true },
  statut: { type: String, enum: ['soumis', 'valide', 'archive'], default: 'soumis' },
  dateProposition: { type: Date, default: Date.now },
});

propositionTransitSchema.index({ article: 1, transitaire: 1 }, { unique: true });

module.exports = mongoose.model('PropositionTransit', propositionTransitSchema);


