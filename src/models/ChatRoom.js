const mongoose = require('mongoose');

// Modèle d'une room de discussion (chat) entre deux utilisateurs (vendeur et transitaire)
const chatRoomSchema = new mongoose.Schema({
  // Tableau des participants (vendeur et transitaire)
  participants: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  ],
  // Article concerné par la discussion (optionnel mais recommandé)
  article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article' },

  // Contexte non-article (ex: Tricycle)
  contextType: {
    type: String,
    enum: ['article', 'tricycle'],
    default: 'article',
  },
  contextId: { type: mongoose.Schema.Types.ObjectId, default: null },

  // Date de création de la room
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ChatRoom', chatRoomSchema); 