const ChatRoom = require('../models/ChatRoom');
const Message = require('../models/Message');
const notificationController = require('./notificationController');
const User = require('../models/User');
const Article = require('../models/Article');

// Créer ou récupérer une room entre deux utilisateurs pour un article
exports.createOrGetRoom = async (req, res) => {
  try {
    const { user1, user2, article } = req.body;
    console.log('[Chat] createOrGetRoom called with:', { user1, user2, article });
    if (!user1 || !user2 || !article) {
      console.error('[Chat] Missing user1, user2, or article:', { user1, user2, article });
      return res.status(400).json({ message: 'user1, user2 et article sont requis' });
    }
    // Chercher si une room existe déjà pour ces deux users et cet article
    let room = await ChatRoom.findOne({
      participants: { $all: [user1, user2] },
      article
    });
    if (!room) {
      // Créer la room si elle n'existe pas
      room = new ChatRoom({ participants: [user1, user2], article });
      await room.save();
      
      // Envoyer une notification au vendeur si c'est un transitaire qui crée la discussion
      try {
        const currentUser = await User.findById(user1);
        const otherUser = await User.findById(user2);
        const articleData = await Article.findById(article);
        
        if (currentUser && otherUser && articleData) {
          // Déterminer qui est le vendeur et qui est le transitaire
          let vendeur, transitaire;
          if (currentUser.role === 'transitaire' && otherUser.role === 'vendeur') {
            transitaire = currentUser;
            vendeur = otherUser;
          } else if (currentUser.role === 'vendeur' && otherUser.role === 'transitaire') {
            vendeur = currentUser;
            transitaire = otherUser;
          }
          
          // Envoyer notification au vendeur si c'est un transitaire qui initie
          if (transitaire && vendeur) {
            await notificationController.createNotification(
              vendeur._id,
              transitaire._id,
              'Nouvelle discussion',
              `${transitaire.prenoms} ${transitaire.nom} a initié une discussion concernant votre article "${articleData.titre}"`,
              'chat',
              room._id,
              'ChatRoom'
            );
          }
        }
      } catch (error) {
        console.error('[Chat] Erreur lors de l\'envoi de notification:', error);
      }
    }
    // Peupler les infos utiles pour le front
    await room.populate('participants', 'nom prenoms email photo role');
    await room.populate('article', 'titre photos');
    res.status(200).json(room);
  } catch (error) {
    console.error('[Chat] Erreur lors de la création/récupération de la room:', error);
    res.status(500).json({ message: 'Erreur lors de la création/récupération de la room', error: error.message, stack: error.stack });
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
    
    // Récupérer les participants de la room pour les notifications
    const room = await ChatRoom.findById(roomId).populate('participants', '_id');
    if (room) {
      // Envoyer une notification temps réel à tous les participants
      room.participants.forEach(participant => {
        if (participant._id.toString() !== sender.toString()) {
          const socketId = global.userSockets.get(participant._id.toString());
          if (socketId) {
            global.io.to(socketId).emit('new-message', {
              roomId,
              message: {
                _id: message._id,
                content: message.content,
                fileUrl: message.fileUrl,
                sender: message.sender,
                createdAt: message.createdAt,
                isRead: message.isRead
              }
            });
          }
        }
      });
    }
    
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

// Marquer les messages d'une room comme lus
exports.markMessagesAsRead = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;
    
    // Marquer tous les messages non lus de cette room comme lus
    // (sauf ceux envoyés par l'utilisateur actuel)
    await Message.updateMany(
      { 
        room: roomId, 
        sender: { $ne: userId }, // Pas les messages de l'utilisateur actuel
        isRead: false 
      },
      { isRead: true }
    );
    
    res.json({ message: 'Messages marqués comme lus' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors du marquage des messages', error });
  }
};

// Récupérer le nombre de messages non lus par room
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Récupérer toutes les rooms de l'utilisateur
    const rooms = await ChatRoom.find({ participants: userId });
    const roomIds = rooms.map(room => room._id);
    
    // Compter les messages non lus pour chaque room
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          room: { $in: roomIds },
          sender: { $ne: userId }, // Pas les messages de l'utilisateur actuel
          isRead: false
        }
      },
      {
        $group: {
          _id: '$room',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Formater le résultat
    const result = {};
    unreadCounts.forEach(item => {
      result[item._id.toString()] = item.count;
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération du nombre de messages non lus', error });
  }
};

// Supprimer un message
exports.deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;
    
    // Vérifier que le message existe et appartient à l'utilisateur
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message non trouvé' });
    }
    
    // Vérifier que l'utilisateur est l'auteur du message
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Vous n\'êtes pas autorisé à supprimer ce message' });
    }
    
    // Supprimer le message
    await Message.findByIdAndDelete(messageId);
    
    // Notifier les autres participants de la suppression
    const room = await ChatRoom.findById(message.room).populate('participants', '_id');
    if (room) {
      room.participants.forEach(participant => {
        if (participant._id.toString() !== userId.toString()) {
          const socketId = global.userSockets.get(participant._id.toString());
          if (socketId) {
            global.io.to(socketId).emit('message-deleted', {
              roomId: message.room,
              messageId: messageId
            });
          }
        }
      });
    }
    
    res.json({ message: 'Message supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la suppression du message', error });
  }
};

// Gérer les typing indicators via Socket.io
// Cette fonction sera appelée directement par les événements Socket.io
exports.handleTypingIndicator = (socket, roomId, isTyping, userId) => {
  try {
    // Notifier tous les autres participants de la room
    socket.to(roomId).emit('typing-indicator', {
      roomId,
      userId,
      isTyping,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Erreur lors de la gestion du typing indicator:', error);
  }
};

// Mettre à jour le statut en ligne d'un utilisateur
exports.updateOnlineStatus = async (userId, isOnline) => {
  try {
    const User = require('../models/User');
    await User.findOneAndUpdate(
      { uid: userId }, // Changé de firebaseUid à uid
      { 
        isOnline,
        lastSeen: isOnline ? new Date() : new Date()
      }
    );
  } catch (error) {
    console.error('Erreur lors de la mise à jour du statut en ligne:', error);
  }
};

// Récupérer le statut en ligne des participants d'une room
exports.getParticipantsStatus = async (req, res) => {
  try {
    const { roomId } = req.params;
    
    // Récupérer la room avec les participants
    const room = await ChatRoom.findById(roomId).populate('participants', 'uid nom prenoms isOnline lastSeen'); // Changé firebaseUid à uid
    
    if (!room) {
      return res.status(404).json({ message: 'Room non trouvée' });
    }
    
    // Formater les données de statut
    const participantsStatus = room.participants.map(participant => ({
      userId: participant.uid, // Changé firebaseUid à uid
      nom: participant.nom,
      prenoms: participant.prenoms,
      isOnline: participant.isOnline,
      lastSeen: participant.lastSeen
    }));
    
    res.json(participantsStatus);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération du statut des participants', error });
  }
};

// Rechercher dans l'historique des messages
exports.searchMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { query, limit = 20, skip = 0 } = req.query;
    const userId = req.user._id;
    
    // Vérifier que l'utilisateur est participant de la room
    const room = await ChatRoom.findById(roomId);
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({ message: 'Accès non autorisé à cette room' });
    }
    
    // Construire la requête de recherche
    const searchQuery = {
      room: roomId,
      $or: [
        { content: { $regex: query, $options: 'i' } }, // Recherche insensible à la casse
        { 'sender.nom': { $regex: query, $options: 'i' } },
        { 'sender.prenoms': { $regex: query, $options: 'i' } }
      ]
    };
    
    // Exécuter la recherche avec pagination
    const messages = await Message.find(searchQuery)
      .sort({ createdAt: -1 }) // Plus récents en premier
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('sender', 'nom prenoms email photo role');
    
    // Compter le total des résultats
    const total = await Message.countDocuments(searchQuery);
    
    res.json({
      messages,
      total,
      hasMore: total > parseInt(skip) + messages.length,
      query
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la recherche de messages', error });
  }
};

// Récupérer l'historique des messages avec filtres
exports.getMessageHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { 
      startDate, 
      endDate, 
      senderId, 
      hasFile, 
      limit = 50, 
      skip = 0 
    } = req.query;
    const userId = req.user._id;
    
    // Vérifier que l'utilisateur est participant de la room
    const room = await ChatRoom.findById(roomId);
    if (!room || !room.participants.includes(userId)) {
      return res.status(403).json({ message: 'Accès non autorisé à cette room' });
    }
    
    // Construire les filtres
    const filters = { room: roomId };
    
    if (startDate && endDate) {
      filters.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (senderId) {
      filters.sender = senderId;
    }
    
    if (hasFile === 'true') {
      filters.fileUrl = { $exists: true, $ne: null };
    } else if (hasFile === 'false') {
      filters.fileUrl = { $exists: false };
    }
    
    // Exécuter la requête avec pagination
    const messages = await Message.find(filters)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .populate('sender', 'nom prenoms email photo role');
    
    // Compter le total
    const total = await Message.countDocuments(filters);
    
    res.json({
      messages,
      total,
      hasMore: total > parseInt(skip) + messages.length,
      filters: {
        startDate,
        endDate,
        senderId,
        hasFile
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération de l\'historique', error });
  }
}; 