const mongoose = require('mongoose');

const publiciteSchema = new mongoose.Schema({
  description: { type: String, required: true }, // Description de la demande
  typePub: { type: String, enum: ['Sponsorisée', 'À la une'], required: true }, // Type de pub
  duree: { type: String, required: true }, // Durée choisie
  prix: { type: Number, required: true }, // Prix de la pub
  moyenPaiement: { type: String, enum: ['Paiement bancaire', 'Mobile Money'], required: true }, // Moyen de paiement
  media: [String], // URLs des images/vidéos
  statut: { type: String, enum: ['en_attente', 'payee', 'valide', 'rejete'], default: 'en_attente' }, // Statut de la demande
  vendeur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Référence au vendeur
  dateDemande: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Publicite', publiciteSchema); 