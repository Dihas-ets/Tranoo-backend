const mongoose = require('mongoose');

const publiciteSchema = new mongoose.Schema({
  description: { type: String, required: true }, // Description de la demande
  typePub: { type: String, enum: ['Sponsorisée', 'À la une'], required: true }, // Type de pub
  duree: { type: String, required: true }, // Durée choisie
  prix: { type: Number, required: true }, // Prix de la pub
  moyenPaiement: { type: String, enum: ['Paiement bancaire', 'Mobile Money'], required: true }, // Moyen de paiement
  media: [String], // URLs des images/vidéos
  statut: { type: String, enum: ['en_attente', 'payee', 'valide', 'rejete', 'expire'], default: 'en_attente' }, // Statut de la demande
  vendeur: { type: String, ref: 'User', required: true }, // Référence au vendeur
  articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' }, // Référence à l'article créé (optionnel)
  dateDemande: { type: Date, default: Date.now },
  dateDebut: { type: Date }, // Date de début de la publicité (quand validée)
  dateFin: { type: Date } // Date de fin de la publicité
});

module.exports = mongoose.model('Publicite', publiciteSchema); 