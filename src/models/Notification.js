const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.Mixed, // Peut être: ObjectId (user) OU String (email ou uid admin)
    // ref uniquement utilisé si ObjectId natif, sinon fallback
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: [
      'chat',
      'publicite',
      'paiement',
      'promotion',
      'alerte',
      'proposition_alerte',
      'new_article', // notification de nouvel article
      'general',
      'verification',
      'delivery', // notifications liées aux livraisons
      'tricycle', // notifications liées aux contacts tricycle
    ],
    default: 'general'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedModel'
  },
  relatedModel: {
    type: String,
    enum: ['ChatRoom', 'Publicite', 'Article', 'User', 'Achat', 'Delivery', 'TricycleContact']
  },
  // Données métier optionnelles (ex: alerte recherche acheteur -> vendeurs)
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  // Nouveaux champs pour les notifications de vérification
  actions: [{
    label: {
      type: String,
      required: false
    },
    action: {
      type: String,
      required: false
    },
    color: {
      type: String,
      required: false
    }
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  // Données spécifiques à la vérification
  verificationData: {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article'
    },
    verificationDate: Date,
    verificationDetails: String,
    verificationCost: Number
  },
  // Pièces jointes (Cloudinary URLs)
  attachments: {
    images: [{ type: String }],
    stampUrl: { type: String },
    signatureUrl: { type: String },
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index pour améliorer les performances
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ type: 1, status: 1 }); // Nouvel index pour les vérifications

module.exports = mongoose.model('Notification', notificationSchema);
