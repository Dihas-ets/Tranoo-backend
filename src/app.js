const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const authMiddleware = require('./middlewares/auth');
const { createServer } = require('http');
const { Server } = require('socket.io');

// Charger les variables d'environnement
dotenv.config();

// Initialiser Firebase Admin
const serviceAccount = require('./firebaseServiceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
const server = createServer(app);

// Configuration Socket.io
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Stockage des connexions utilisateurs
const userSockets = new Map();

// Gestion des connexions Socket.io
io.on('connection', (socket) => {
  console.log('Nouvelle connexion Socket.io:', socket.id);

  // Authentification de l'utilisateur
  socket.on('authenticate', async (token) => {
    try {
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;
      
      // Stocker la connexion de l'utilisateur
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      
      // Mettre à jour le statut en ligne
      const chatController = require('./controllers/chatController');
      await chatController.updateOnlineStatus(userId, true);
      
      console.log(`Utilisateur ${userId} connecté via Socket.io`);
      socket.emit('authenticated', { success: true });
    } catch (error) {
      console.error('Erreur d\'authentification Socket.io:', error);
      socket.emit('authenticated', { success: false, error: 'Token invalide' });
    }
  });

  // Rejoindre une room de chat
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} a rejoint la room ${roomId}`);
  });

  // Quitter une room de chat
  socket.on('leave-room', (roomId) => {
    socket.leave(roomId);
    console.log(`Socket ${socket.id} a quitté la room ${roomId}`);
  });

  // Gestion des typing indicators
  socket.on('typing-start', (roomId) => {
    if (socket.userId) {
      socket.to(roomId).emit('typing-indicator', {
        roomId,
        userId: socket.userId,
        isTyping: true,
        timestamp: new Date()
      });
    }
  });

  socket.on('typing-stop', (roomId) => {
    if (socket.userId) {
      socket.to(roomId).emit('typing-indicator', {
        roomId,
        userId: socket.userId,
        isTyping: false,
        timestamp: new Date()
      });
    }
  });

  // Déconnexion
  socket.on('disconnect', async () => {
    if (socket.userId) {
      userSockets.delete(socket.userId);
      
      // Mettre à jour le statut hors ligne
      const chatController = require('./controllers/chatController');
      await chatController.updateOnlineStatus(socket.userId, false);
      
      console.log(`Utilisateur ${socket.userId} déconnecté de Socket.io`);
    }
    console.log('Déconnexion Socket.io:', socket.id);
  });
});

// Rendre io accessible globalement
global.io = io;
global.userSockets = userSockets;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Connexion à MongoDB
mongoose.connect(process.env.MONGO_URI).then(() => console.log('MongoDB connecté'))
  .catch((err) => console.error('Erreur MongoDB:', err));

// Routes publiques
app.get('/', (_req, res) => {
  res.send('API opérationnelle');
});

// Routes protégées
const protectedRoutes = require('./routes/protected');
app.use('/api/protected', authMiddleware, protectedRoutes);

// Route d'authentification (inscription)
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes); 

// Routes utilisateurs (CRUD)
const userRoutes = require('./routes/user');
app.use('/api/users', authMiddleware, userRoutes);

// Routes articles (CRUD)
const articleRoutes = require('./routes/article');
app.use('/api/articles', authMiddleware, articleRoutes);

// Routes demandes de publicité (CRUD)
const publiciteRoutes = require('./routes/publicite');
app.use('/api/publicites', publiciteRoutes);

// Routes demandes de certification chauffeur (CRUD)
const demandeChauffeurRoutes = require('./routes/demandeChauffeur');
app.use('/api/chauffeurs/demandes', demandeChauffeurRoutes);

// Routes statistiques
app.use('/stats', require('./routes/stats'));

// Importer le routeur de chat pour la messagerie (vendeur <-> transitaire)
const chatRoutes = require('./routes/chat');
// Utiliser les routes de chat sous le préfixe /api/chat
app.use('/api/chat', chatRoutes);

// Routes notifications
const notificationRoutes = require('./routes/notification');
app.use('/api/notifications', notificationRoutes);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
  console.log('🚀 WebSocket server (Socket.io) démarré et prêt à recevoir des connexions');
});

