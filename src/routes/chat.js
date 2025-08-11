const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middlewares/auth');

// Créer ou récupérer une room entre deux utilisateurs pour un article
// POST /api/chat/room
router.post('/room', (req, _res, next) => {
  console.log('[ROUTE] POST /chat/room appelée', req.body, 'headers:', req.headers.authorization);
  next();
}, auth, chatController.createOrGetRoom);

// Lister toutes les rooms d'un utilisateur
// GET /api/chat/rooms
router.get('/rooms', auth, chatController.getUserRooms);

// Envoyer un message dans une room
// POST /api/chat/message
router.post('/message', auth, chatController.sendMessage);

// Lister les messages d'une room
// GET /api/chat/messages/:roomId
router.get('/messages/:roomId', auth, chatController.getRoomMessages);

// Marquer les messages d'une room comme lus
// POST /api/chat/messages/:roomId/read
router.post('/messages/:roomId/read', auth, chatController.markMessagesAsRead);

// Récupérer le nombre de messages non lus par room
// GET /api/chat/unread-count
router.get('/unread-count', auth, chatController.getUnreadCount);

// Supprimer un message
// DELETE /api/chat/messages/:messageId
router.delete('/messages/:messageId', auth, chatController.deleteMessage);

// Récupérer le statut en ligne des participants d'une room
// GET /api/chat/rooms/:roomId/participants-status
router.get('/rooms/:roomId/participants-status', auth, chatController.getParticipantsStatus);

// Rechercher dans l'historique des messages
// GET /api/chat/messages/:roomId/search?query=texte&limit=20&skip=0
router.get('/messages/:roomId/search', auth, chatController.searchMessages);

// Récupérer l'historique des messages avec filtres
// GET /api/chat/messages/:roomId/history?startDate=2024-01-01&endDate=2024-12-31&senderId=123&hasFile=true&limit=50&skip=0
router.get('/messages/:roomId/history', auth, chatController.getMessageHistory);

module.exports = router; 