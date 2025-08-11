const mongoose = require('mongoose');

// Modèle d'un message dans une room de discussion
const messageSchema = new mongoose.Schema({
  // Room à laquelle appartient le message
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatRoom', required: true },
  // Auteur du message
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // Contenu texte du message (optionnel si fichier)
  content: { type: String },
  // URL d'un fichier joint (image, document, etc.)
  fileUrl: { type: String },
  // Statut de lecture du message
  isRead: { type: Boolean, default: false },
  // Date d'envoi du message
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema); 