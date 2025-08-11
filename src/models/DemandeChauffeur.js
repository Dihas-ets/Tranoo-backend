const mongoose = require('mongoose');

const demandeChauffeurSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Référence au chauffeur
  nom: { type: String, required: true }, // Nom de famille
  prenom: { type: String, required: true }, // Prénom
  telephone: { type: String, required: true }, // Numéro de téléphone
  email: { type: String, required: true }, // Email
  numeroPermit: { type: String, required: true }, // Numéro de permis
  message: String, // Message libre
  permisFile: String, // URL du fichier permis (pdf ou image)
  statut: { type: String, enum: ['en_attente', 'valide', 'rejete'], default: 'en_attente' }, // Statut de la demande
  dateDemande: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DemandeChauffeur', demandeChauffeurSchema); 