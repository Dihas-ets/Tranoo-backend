const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const admin = require('firebase-admin');
const authMiddleware = require('./middlewares/auth');

// Charger les variables d'environnement
dotenv.config();

// Initialiser Firebase Admin
const serviceAccount = require('./firebaseServiceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const app = express();
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

