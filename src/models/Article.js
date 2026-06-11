const mongoose = require('mongoose');

// Modèle Article unique pour voitures et pièces détachées
const articleSchema = new mongoose.Schema({
  type: { type: String, enum: ['voiture', 'piece'], required: true }, // Type d'article
  titre: { type: String, required: true }, // Titre ou nom
  description: String, // Description
  prix: Number, // Prix de vente
  entreprise: String, // Nom de l'entreprise
  photos: [String], // URLs des photos principales et intérieures
  video: String, // URL de la vidéo (optionnelle)
  // Champs spécifiques voiture
  marque: String,      // Marque de la voiture
  modele: String,      // Modèle de la voiture
  annee: String,       // Année
  cylindre: String,    // Cylindre
  boiteVitesse: String,// Boîte à vitesse
  carburant: String,   // Carburant
  climatiseur: String, // Climatiseur
  distance: String,    // Distance parcourue
  sieges: String,      // Nombre de sièges
  portes: String,      // Nombre de portes
  condition: String,   // Condition (Nouveau/Occasion)
  couleur: String,     // Couleur du véhicule
  dedouanement: Boolean, // Dédouanement (true = Oui, false = Non)
  lieu: String,        // Localisation (ancienne version, garde pour compatibilité)
  localisation: String, // Alias compat (apps)
  pays: String,        // Pays déduit (saisie ou géocodage)
  // Informations détaillées sur le fournisseur (pour le parcours livreur)
  fournisseur: {
    nom: String,
    prenom: String,
    telephone: String,
    adresseTexte: String, // Adresse lisible (texte libre)
    departement: String,
    commune: String,
    ville: String,
    quartier: String,
    latitude: Number,
    longitude: Number,
  },
  // Champs spécifiques pièce
  categorie: String,   // Catégorie de pièce (frein, moteur, electricité, etc.)
  typeMoteur: String,  // Type de moteur (Essence, Gazoil, etc.)
  // Champs d'affichage
  aLaUne: { type: Boolean, default: false }, // À la une
  sponsorise: { type: Boolean, default: false }, // Sponsorisé
  recommande: { type: Boolean, default: false }, // Recommandé
  // Statut de publication
  statut: {
    type: String,
    enum: ['en_attente', 'en_ligne', 'rejeté', 'vendu', 'non_vendu'],
    default: 'en_ligne',
  },
  motifRejet: { type: String, default: null },
  dateRejet: { type: Date, default: null },
  // Rupture / disponible (vendeur) — rupture = vert côté vendeur, badge non cliquable côté acheteur ; disponible = rouge côté vendeur, rien côté acheteur
  stockStatus: {
    type: String,
    enum: ['disponible', 'rupture'],
    default: 'disponible'
  },
  // Lien avec le vendeur (utilisateur)
  vendeur: { type: String, ref: 'User', required: true },
  dateCreation: { type: Date, default: Date.now },
  statutVente: {
    type: String,
    enum: ['non vendu', 'en_attente', 'vendu'],
    default: 'non vendu'
  },
  acheteur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  chauffeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // Ajout pour lier un chauffeur
  dateLivraison: { type: Date, default: null }, // Date de livraison (null = en cours)
  dateAchat: { type: Date, default: null }, // Date à laquelle l'acheteur est lié à l'article
  // Source de l'article : 'tranoo' (Landing Page) ou 'app' (application principale)
  source: { type: String, enum: ['tranoo', 'app'], default: 'app' },
  // Verrouillage automatique des pièces si abonnement vendeur inactif
  subscriptionLocked: { type: Boolean, default: false },
  subscriptionLockedAt: { type: Date, default: null },
  // Contexte d'une proposition suite à une alerte acheteur
  alertContext: {
    sourceNotificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', default: null },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestType: { type: String, default: null },
  },
  // Statistiques de vues
  viewsReal: { type: Number, default: 0 },
  viewsAuto: { type: Number, default: 0 },
  views: { type: Number, default: 0 }, // Total affiché (réelles + auto), recalculé à la sauvegarde
  lastViewed: { type: Date, default: null },
  autoViewsTarget: { type: Number, default: 50 },
  autoViewsStartedAt: { type: Date, default: null },
  autoViewsCompleted: { type: Boolean, default: false },
});

articleSchema.pre('save', function syncViewsTotal(next) {
  const real = Number(this.viewsReal) || 0;
  const auto = Number(this.viewsAuto) || 0;
  if (real === 0 && auto === 0 && Number(this.views) > 0 && !this.isModified('viewsReal')) {
    this.viewsReal = Number(this.views);
  }
  this.views = real + auto;
  next();
});

module.exports = mongoose.model('Article', articleSchema);