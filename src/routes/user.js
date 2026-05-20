const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const roleMiddleware = require('../middlewares/role');
const auth = require('../middlewares/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const { 
  getAcheteursWithAchats, 
  getAllAcheteurs, 
  getAllVendeurs,
  getAllTransitaires,
  getAllChauffeurs,
  getAllAdmins
} = require("../controllers/userController");

// Liste des utilisateurs (option de filtrage par rôle)
// router.get('/', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.getAllUsers);
router.get('/', userController.getAllUsers);
// Routes spécifiques par rôle
router.get("/vendeurs/all", getAllVendeurs);
router.get("/acheteurs/all", getAllAcheteurs);
router.get("/acheteurs/achats", getAcheteursWithAchats);
router.get("/transitaires/all", getAllTransitaires);
router.get("/chauffeurs/all", getAllChauffeurs);
router.get("/admins/all", getAllAdmins);
// Création d'un utilisateur (chauffeur, admin, etc.)
router.post('/', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.createUser);
// Mettre à jour le profil de l'utilisateur connecté
router.patch('/me', auth, userController.updateMe);

// Mettre à jour le mot de passe de l'utilisateur connecté
router.patch('/password', auth, userController.updateMyPassword);

// Route pour mettre à jour le token FCM
router.post('/fcm-token', auth, userController.updateFcmToken);

// Suppression du compte de l'utilisateur connecté (Apple Guideline 5.1.1(v))
router.delete('/me', auth, userController.deleteMyAccount);

// Favoris de l'utilisateur connecté
router.get('/me/favoris', auth, userController.getMyFavorites);
router.post('/me/favoris', auth, userController.addFavorite);
router.delete('/me/favoris', auth, userController.removeFavorite);

// Détail d'un utilisateur
router.get('/:id', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.getUserById);
// Mise à jour d'un utilisateur
router.put('/:id', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.updateUser);
// Suppression d'un utilisateur
router.delete('/:id', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.deleteUser);
router.put('/:id/password', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.updatePassword);

// Route pour upload photo de profil (chemin conservé pour compatibilité)
router.post('/users/photo', auth, upload.single('photo'), userController.uploadProfilePhoto);

// Récupérer les activités d'un chauffeur
router.get('/:id/activites', roleMiddleware('superAdmin', 'principal', 'gestionnaire', 'admin'), userController.getChauffeurActivities);

// Bloquer/Débloquer un utilisateur (admin seulement)
router.patch('/:id/block', auth, userController.blockUser);
router.patch('/:id/unblock', auth, userController.unblockUser);

// Réinitialiser le mot de passe Firebase d'un utilisateur (admin seulement)
router.post('/:id/reset-firebase-password', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.resetFirebasePassword);

module.exports = router; 