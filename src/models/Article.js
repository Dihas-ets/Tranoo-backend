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
    enum: ['en_attente', 'validé', 'rejeté'],
    default: 'en_attente'
  },
  // Lien avec le vendeur (utilisateur)
  vendeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  dateCreation: { type: Date, default: Date.now },
  statutVente: {
    type: String,
    enum: ['vendu', 'non vendu'],
    default: 'non vendu'
  },
  acheteur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});

module.exports = mongoose.model('Article', articleSchema); 