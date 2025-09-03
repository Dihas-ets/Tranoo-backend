const mongoose = require('mongoose');

const achatSchema = new mongoose.Schema(
  {
    acheteur: { type: String, ref: 'User', required: true }, // uid Firebase ou _id Mongo selon usage
    article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true },
    propositionTransit: { type: mongoose.Schema.Types.ObjectId, ref: 'PropositionTransit' },
    modeLivraison: { type: String, enum: ['consommation', 'transit'], required: true },
    paysDestination: { type: String },
    detailsSupplementaires: { type: String },
    services: {
      carburant: { type: Boolean, default: false },
      chauffeur: { type: Boolean, default: false },
      fraisRoute: { type: Boolean, default: false },
      transitaire: { type: Boolean, default: true }
    },
    pieceType: { type: String },
    pieceNumero: { type: String },
    fichierNom: { type: String },
    fichierUrl: { type: String },
    // Montants (optionnels pour futur calcul)
    tarifTransitaire: { type: Number },
    fraisSuppTotal: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Achat', achatSchema);


