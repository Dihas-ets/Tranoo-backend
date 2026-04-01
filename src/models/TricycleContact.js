const mongoose = require('mongoose');

const tricycleContactSchema = new mongoose.Schema(
  {
    // Utilisateur (Tranoo)
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Chauffeur de tricycle (Tranoo_pro)
    chauffeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Statut du contact (sert d'autorisation côté chauffeur)
    status: {
      type: String,
      enum: ['initiated', 'accepted', 'closed'],
      default: 'initiated',
    },

    // Preuve d'acceptation explicite par le chauffeur
    acceptedAt: { type: Date, default: null },

    // Snapshot des positions au moment de l'initiation (optionnel)
    userLocationSnapshot: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
      timestamp: { type: Date },
    },
    chauffeurLocationSnapshot: {
      latitude: { type: Number },
      longitude: { type: Number },
      address: { type: String },
      timestamp: { type: Date },
    },

    // Méta
    lastMessageAt: { type: Date, default: null },

    // Lu par le chauffeur (pour ne plus afficher comme non lu dans la bannière)
    readByChauffeurAt: { type: Date, default: null },
  },
  { timestamps: true }
);

tricycleContactSchema.index({ user: 1, chauffeur: 1, status: 1 });
tricycleContactSchema.index({ createdAt: -1 });

module.exports = mongoose.model('TricycleContact', tricycleContactSchema);

