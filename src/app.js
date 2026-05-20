
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);




const express = require('express');

const mongoose = require('mongoose');

const cors = require('cors');

const dotenv = require('dotenv');

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const authMiddleware = require('./middlewares/auth');

const { createServer } = require('http');

const { Server } = require('socket.io');



// Charger les variables d'environnement

dotenv.config();



// Initialiser Firebase Admin
//
// IMPORTANT (prod): ne pas dépendre uniquement d'un fichier local qui peut manquer sur le serveur.
// On supporte 2 modes:
// - FIREBASE_SERVICE_ACCOUNT_JSON: JSON complet (string) du service account
// - ./firebaseServiceAccountKey.json: fichier à côté de ce module
function loadServiceAccount() {
  // 1) via variable d'env (recommandé en prod)
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw && String(raw).trim()) {
    try {
      return JSON.parse(String(raw));
    } catch (e) {
      console.error('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON invalide (JSON.parse a échoué):', e?.message || e);
    }
  }

  // 2) via fichier local (dev)
  const localPath = path.join(__dirname, 'firebaseServiceAccountKey.json');
  try {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Fichier service account introuvable: ${localPath}`);
    }
    // require garde un cache; fs + JSON.parse évite les surprises lors des déploiements
    const txt = fs.readFileSync(localPath, 'utf8');
    return JSON.parse(txt);
  } catch (e) {
    console.error('[FCM] Impossible de charger la clé firebase admin:', e?.message || e);
    return null;
  }
}

const serviceAccount = loadServiceAccount();
if (!serviceAccount) {
  console.error('[FCM] Firebase Admin NON initialisé (service account manquant). Les notifications push échoueront.');
} else {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log('[FCM] Firebase Admin initialisé. project_id=', serviceAccount.project_id);
  } catch (e) {
    console.error('[FCM] Erreur initializeApp firebase-admin:', e?.message || e, e?.stack);
  }
}



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

      // IMPORTANT: compatibilité MongoDB _id
      // Certains flux (ex: chatController.sendMessage) utilisent l'_id Mongo comme clé
      try {
        const User = require('./models/User');
        const userDoc = await User.findOne({ uid: userId }).select('_id');
        if (userDoc && userDoc._id) {
          const mongoId = userDoc._id.toString();
          userSockets.set(mongoId, socket.id);
          socket.mongoId = mongoId;
        }
      } catch (e) {
        console.warn('[Socket.io] Liaison mongoId échouée:', e.message);
      }

      

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

      // Supprimer aussi le mapping mongoId si présent
      if (socket.mongoId) {
        userSockets.delete(socket.mongoId);
      }

      

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

  allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform', 'X-Web-Session-Id'],

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

// Auth events (mobile login/logout tracking)
try {
  const authEventRoutes = require('./routes/authEvent');
  app.use('/api/auth-events', authEventRoutes);
} catch (e) {
  console.warn('Auth events routes non chargées:', e.message);
}

// Demo proof events (clicks/actions tracking)
try {
  const demoEventRoutes = require('./routes/demoEvent');
  app.use('/api/demo-events', demoEventRoutes);
} catch (e) {
  console.warn('Demo events routes non chargées:', e.message);
}



// Routes utilisateurs (CRUD)

const userRoutes = require('./routes/user');

app.use('/api/users', authMiddleware, userRoutes);



// Routes articles (CRUD)

const articleRoutes = require('./routes/article');

app.use('/api/articles', authMiddleware, articleRoutes);

// Routes upload/transcodage vidéo
const uploadRoutes = require('./routes/upload');
app.use('/api/upload', uploadRoutes);


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

// Routes géographiques Bénin (départements/communes/villes/quartiers)
try {
  const geoBeninRoutes = require('./routes/geoBenin');
  app.use('/api/geo/benin', geoBeninRoutes);
} catch (e) {
  console.warn('Geo Benin routes non chargées:', e.message);
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

// (Removed) Generic admin mount for pub pricing to avoid route conflicts

// Order routes
try {
  const orderRoutes = require('./routes/order');
  app.use('/api/orders', orderRoutes);
} catch (e) {
  console.warn('Order routes non chargées:', e.message);
}

// Invoice routes
try {
  const invoiceRoutes = require('./routes/invoice');
  app.use('/api/invoices', invoiceRoutes);
  // Alias de compatibilité (anciens chemins possibles côté clients)
  app.use('/api/invoice', invoiceRoutes);
  app.use('/api/factures', invoiceRoutes);
} catch (e) {
  console.warn('Invoice routes non chargées:', e.message);
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

// Subscription pricing routes 
try {
  const subscriptionPricingRoutes = require('./routes/subscriptionPricing');
  app.use('/api/admin/subscription-pricing', subscriptionPricingRoutes);
} catch (e) {
  console.warn('Subscription pricing routes non chargées:', e.message);
}

// Verification pricing routes (véhicule — Tranoo)
try {
  const verificationPricingRoutes = require('./routes/verificationPricing');
  app.use('/api/admin/verification-pricing', verificationPricingRoutes);
} catch (e) {
  console.warn('Verification pricing routes non chargées:', e.message);
}

// Referral routes
try {
  const referralRoutes = require('./routes/referral');
  app.use('/api/referrals', referralRoutes);
} catch (e) {
  console.warn('Referral routes non chargées:', e.message);
}

// Referral tariffs routes
try {
  const referralTariffRoutes = require('./routes/referralTariff');
  app.use('/api/referral-tariffs', referralTariffRoutes);
} catch (e) {
  console.warn('Referral tariffs routes non chargées:', e.message);
}

// Agents routes
try {
  const agentRoutes = require('./routes/agent');
  app.use('/api/agents', agentRoutes);
} catch (e) {
  console.warn('Agents routes non chargées:', e.message);
}

// Livreur routes
try {
  const livreurRoutes = require('./routes/livreur');
  app.use('/api/livreurs', livreurRoutes);
} catch (e) {
  console.warn('Livreur routes non chargées:', e.message);
}

// Livreur balance routes
try {
  const livreurBalanceRoutes = require('./routes/livreurBalance');
  app.use('/api/livreurs/balance', livreurBalanceRoutes);
} catch (e) {
  console.warn('Livreur balance routes non chargées:', e.message);
}

// Delivery routes
try {
  const deliveryRoutes = require('./routes/delivery');
  app.use('/api/deliveries', deliveryRoutes);
} catch (e) {
  console.warn('Delivery routes non chargées:', e.message);
}

// Delivery zones routes
try {
  const deliveryZoneRoutes = require('./routes/deliveryZone');
  app.use('/api/delivery-zones', deliveryZoneRoutes);
} catch (e) {
  console.warn('Delivery zones routes non chargées:', e.message);
}

// Tricycle routes
try {
  const tricycleRoutes = require('./routes/tricycle');
  app.use('/api/tricycles', tricycleRoutes);
} catch (e) {
  console.warn('Tricycle routes non chargées:', e.message);
}

// Settings routes
try {
  const settingsRoutes = require('./routes/settings');
  app.use('/api/settings', settingsRoutes);
} catch (e) {
  console.warn('Settings routes non chargées:', e.message);
}

// Views routes (statistiques de vues)
try {
  const viewsRoutes = require('./routes/views');
  app.use('/api/views', viewsRoutes);
} catch (e) {
  console.warn('Views routes non chargées:', e.message);
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

  // Démarrer le worker de réoffre des livraisons (toutes les 60s)
  try {
    const deliveryController = require('./controllers/deliveryController');
    deliveryController.startDeliveryOfferWorker();
  } catch (e) {
    console.warn('Worker réoffre livraisons non démarré:', e.message);
  }

});





