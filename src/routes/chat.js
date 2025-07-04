const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const auth = require('../middlewares/auth');

// Créer ou récupérer une room entre deux utilisateurs pour un article
// POST /api/chat/room
router.post('/room', auth, chatController.createOrGetRoom);

// Lister toutes les rooms d'un utilisateur
// GET /api/chat/rooms
router.get('/rooms', auth, chatController.getUserRooms);

// Envoyer un message dans une room
// POST /api/chat/message
router.post('/message', auth, chatController.sendMessage);

// Lister les messages d'une room
// GET /api/chat/messages/:roomId
router.get('/messages/:roomId', auth, chatController.getRoomMessages);

module.exports = router; 