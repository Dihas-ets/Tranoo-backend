
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


// Routes publiques pour le landing (sans auth)
const publicRoutes = require('./routes/public');
app.use('/api/public', publicRoutes);



// Routes demandes de publicité (CRUD)

const publiciteRoutes = require('./routes/publicite');

app.use('/api/publicites', publiciteRoutes);



// Routes demandes de certification chauffeur (CRUD)

const demandeChauffeurRoutes = require('./routes/demandeChauffeur');

app.use('/api/chauffeurs/demandes', demandeChauffeurRoutes);



// Routes statistiques (déjà incluses dans protected)

// app.use('/stats', require('./routes/stats'));



// Importer le routeur de chat pour la messagerie (vendeur <-> transitaire)

const chatRoutes = require('./routes/chat');

// Utiliser les routes de chat sous le préfixe /api/chat

app.use('/api/chat', chatRoutes);



// Routes achats (validation d'achat depuis payement.dart)
try {
  const achatRoutes = require('./routes/achat');
  app.use('/api/achat', achatRoutes);
} catch (e) {
  console.warn('Achat routes non chargées:', e.message);
}

 
 
// Routes notifications (chargement optionnel)
try {
  const notificationRoutes = require('./routes/notification');
  app.use('/api/notifications', notificationRoutes);
} catch (e) {
  console.warn('Notifications routes non chargées:', e.message);
}

// Routes OTP Push (chargement optionnel)
try {
  const pushOtpRoutes = require('./routes/pushOtp');
  app.use('/api/push-otp', pushOtpRoutes);
} catch (e) {
  console.warn('Push OTP routes non chargées:', e.message);
}



// Wallet routes (dynamique)
try {
  const walletRoutes = require('./routes/wallet');
  app.use('/api/wallet', authMiddleware, walletRoutes);
} catch (e) {
  console.warn('Wallet routes non chargées:', e.message);
}

// Payment routes
try {
  const paymentRoutes = require('./routes/payment');
  app.use('/api/payments', paymentRoutes);
} catch (e) {
  console.warn('Payment routes non chargées:', e.message);
}

// Subscription routes
try {
  const subscriptionRoutes = require('./routes/subscription');
  app.use('/api/subscription', authMiddleware, subscriptionRoutes);
} catch (e) {
  console.warn('Subscription routes non chargées:', e.message);
}

// Pub pricing routes
try {
  const pubPricingRoutes = require('./routes/pubPricing');
  app.use('/api/admin', pubPricingRoutes);
} catch (e) {
  console.warn('Pub pricing routes non chargées:', e.message);
}

// Order routes
try {
  const orderRoutes = require('./routes/order');
  app.use('/api/orders', orderRoutes);
} catch (e) {
  console.warn('Order routes non chargées:', e.message);
}

// Delivery settings routes
try {
  const deliverySettingsRoutes = require('./routes/deliverySettings');
  app.use('/api/admin/delivery-settings', deliverySettingsRoutes);
} catch (e) {
  console.warn('Delivery settings routes non chargées:', e.message);
}

// Pub pricing routes
try {
  const pubPricingRoutes = require('./routes/pubPricing');
  app.use('/api/admin/pub-pricing', pubPricingRoutes);
} catch (e) {
  console.warn('Pub pricing routes non chargées:', e.message);
}

// Referral routes
try {
  const referralRoutes = require('./routes/referral');
  app.use('/api/referrals', referralRoutes);
} catch (e) {
  console.warn('Referral routes non chargées:', e.message);
}

// Obsolète: Routes propositions transitaires (désactivées)
// try {
//   const propositionTransitRoutes = require('./routes/propositionTransit');
//   app.use('/api/transit', propositionTransitRoutes); // fonction obsolète
// } catch (e) {
//   console.warn('Proposition transit routes non chargées:', e.message);
// }



const PORT = process.env.PORT || 5000;



server.listen(PORT, () => {

  console.log(`Serveur démarré sur le port ${PORT}`);

  console.log('🚀 WebSocket server (Socket.io) démarré et prêt à recevoir des connexions');

  // Démarrer le worker de statut des paiements
  try {
    const paymentController = require('./controllers/paymentController');
    paymentController.startPaymentStatusWorker();
  } catch (e) {
    console.warn('Worker paiements non démarré:', e.message);
  }

  // Démarrer les tâches automatiques pour les publicités
  try {
    const { startCronJobs } = require('./utils/cronJobs');
    startCronJobs();
  } catch (e) {
    console.warn('Tâches automatiques publicités non démarrées:', e.message);
  }

});





