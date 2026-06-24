const mongoose = require('mongoose');

const transitMissionSchema = new mongoose.Schema(
  {
    article: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: true,
    },
    acheteur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    transitaire: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    statut: {
      type: String,
      enum: ['parcours', 'en_cours', 'transferer', 'traite', 'annule'],
      default: 'parcours',
    },
    modeLivraison: {
      type: String,
      enum: ['transit', 'consommation'],
      default: 'transit',
    },
    paysDestination: { type: String, default: null },
    detailsSupplementaires: { type: String, default: null },
    articleTitre: { type: String, default: null },
    dateSelectionTransitaire: { type: Date, default: null },
    dateTransfer: { type: Date, default: null },
    dateTraite: { type: Date, default: null },
    verificationApproved: { type: Boolean, default: false },
  },
  { timestamps: true },
);

transitMissionSchema.index({ article: 1, acheteur: 1 }, { unique: true });
transitMissionSchema.index({ transitaire: 1, statut: 1 });

module.exports = mongoose.model('TransitMission', transitMissionSchema);
