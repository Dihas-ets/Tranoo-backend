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
  lieu: String,        // Localisation
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
    default: 'en_attente'
  },
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
});


module.exports = mongoose.model('Article', articleSchema); 