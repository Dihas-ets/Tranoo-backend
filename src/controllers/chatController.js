const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');

// Créer ou récupérer une room entre deux utilisateurs pour un article
exports.createOrGetRoom = async (req, res) => {
  try {
    const { user1, user2, article } = req.body; // user1 = vendeur, user2 = transitaire
    // Chercher si une room existe déjà pour ces deux users et cet article
    let room = await ChatRoom.findOne({
      participants: { $all: [user1, user2] },
      article
    });
    if (!room) {
      // Créer la room si elle n'existe pas
      room = new ChatRoom({ participants: [user1, user2], article });
      await room.save();
    }
    // Peupler les infos utiles pour le front
    await room.populate('participants', 'nom prenoms email photo role');
    await room.populate('article', 'titre photos');
    res.status(200).json(room);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la création/récupération de la room', error });
  }
};

// Lister toutes les rooms d'un utilisateur (vendeur ou transitaire)
exports.getUserRooms = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : req.query.userId;
    // On récupère toutes les rooms où l'utilisateur est participant
    const rooms = await ChatRoom.find({ participants: userId })
      .populate('participants', 'nom prenoms email photo role')
      .populate('article', 'titre photos');
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des rooms', error });
  }
};

// Envoyer un message dans une room
exports.sendMessage = async (req, res) => {
  try {
    const { roomId, content, fileUrl } = req.body;
    const sender = req.user ? req.user._id : req.body.sender;
    const message = new Message({
      room: roomId,
      sender,
      content,
      fileUrl
    });
    await message.save();
    // Peupler les infos du sender pour le front
    await message.populate('sender', 'nom prenoms email photo role');
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de l\'envoi du message', error });
  }
};

// Lister les messages d'une room (avec pagination possible)
exports.getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    // Optionnel : pagination
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const messages = await Message.find({ room: roomId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'nom prenoms email photo role');
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des messages', error });
  }
}; 