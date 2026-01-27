const mongoose = require('mongoose');

const deliveryLocationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  address: { type: String }, // Adresse lisible
});

const deliverySchema = new mongoose.Schema({
  // Référence à la commande
  orderId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Order', 
    required: true 
  },
  
  // Acheteur (client)
  acheteur: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Livreur assigné
  livreur: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null 
  },
  
  // Statut de la livraison
  statut: {
    type: String,
    enum: ['commandé', 'assigné', 'en_cours', 'livré', 'refusé', 'retour', 'annulé'],
    default: 'commandé'
  },
  
  // Informations de livraison
  distanceKm: { type: Number }, // Distance calculée en km
  lieuDepart: {
    nom: { type: String }, // Nom du fournisseur
    adresse: { type: String, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
    telephone: { type: String }
  },
  lieuDestination: {
    nom: { type: String }, // Nom de l'acheteur
    adresse: { type: String, required: true },
    latitude: { type: Number },
    longitude: { type: Number },
    telephone: { type: String }
  },
  
  // Pièces concernées (détails)
  pieces: [{
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },
    titre: { type: String },
    quantite: { type: Number },
    prix: { type: Number }
  }],
  
  // Fournisseur (vendeur des pièces)
  fournisseur: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nom: { type: String },
    entreprise: { type: String },
    adresse: { type: String },
    telephone: { type: String }
  },
  
  // Tracking GPS en temps réel
  currentLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
    timestamp: { type: Date },
    address: { type: String }
  },
  
  // Historique des positions (pour admin tracking)
  locationHistory: [deliveryLocationSchema],
  
  // Dates importantes
  dateCommande: { type: Date, default: Date.now },
  dateAcceptation: { type: Date },
  dateRecuperation: { type: Date }, // Quand le livreur récupère le colis
  dateLivraison: { type: Date }, // Quand le colis est livré
  dateRefus: { type: Date }, // Si le client refuse
  
  // Informations de paiement
  fraisLivraison: { type: Number, required: true }, // Toujours payé
  fraisColis: { type: Number, required: true }, // Remboursé si refus
  totalCommande: { type: Number, required: true },
  
  // Remboursement (si refus)
  remboursement: {
    montant: { type: Number, default: 0 },
    statut: { 
      type: String, 
      enum: ['non_requis', 'en_attente', 'rembourse'], 
      default: 'non_requis' 
    },
    dateRemboursement: { type: Date }
  },
  
  // Raison du refus (si applicable)
  raisonRefus: { type: String },

  // Retour pièce par l'acheteur (signalé par le chauffeur)
  dateRetour: { type: Date },
  raisonRetour: { type: String },
  
  // Notes
  noteLivreur: { type: String },
  noteAcheteur: { type: String },
  
  // Balance du livreur (gain pour cette livraison)
  gainLivreur: { 
    type: Number, 
    default: 0 
  },
  
  // Indicateurs
  colisRecupere: { type: Boolean, default: false },
  colisLivre: { type: Boolean, default: false },
  colisRefuse: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index pour les requêtes fréquentes
deliverySchema.index({ livreur: 1, statut: 1 });
deliverySchema.index({ acheteur: 1, statut: 1 });
deliverySchema.index({ statut: 1, dateCommande: -1 });
deliverySchema.index({ orderId: 1 });

// Middleware pour mettre à jour updatedAt
deliverySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Delivery', deliverySchema);
