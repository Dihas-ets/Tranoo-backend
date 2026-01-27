const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['gain', 'retrait', 'ajustement'],
    required: true
  },
  montant: { type: Number, required: true },
  deliveryId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Delivery',
    default: null 
  },
  description: { type: String },
  statut: {
    type: String,
    enum: ['en_attente', 'valide', 'annule'],
    default: 'valide'
  },
  createdAt: { type: Date, default: Date.now }
});

const livreurBalanceSchema = new mongoose.Schema({
  livreur: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    unique: true 
  },
  
  // Balance actuelle
  balance: { 
    type: Number, 
    default: 0,
    min: 0
  },
  
  // Total des gains (toutes livraisons)
  totalGains: { 
    type: Number, 
    default: 0 
  },
  
  // Total des retraits
  totalRetraits: { 
    type: Number, 
    default: 0 
  },
  
  // Statistiques
  nombreLivraisons: { type: Number, default: 0 },
  nombreLivraisonsReussies: { type: Number, default: 0 },
  nombreLivraisonsRefusees: { type: Number, default: 0 },
  
  // Historique des transactions
  transactions: [transactionSchema],
  
  // Dernière mise à jour
  lastUpdated: { type: Date, default: Date.now }
});

// Index
livreurBalanceSchema.index({ livreur: 1 });

// Middleware pour mettre à jour lastUpdated
livreurBalanceSchema.pre('save', function(next) {
  this.lastUpdated = Date.now();
  next();
});

module.exports = mongoose.model('LivreurBalance', livreurBalanceSchema);
