const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const roleMiddleware = require('../middlewares/role');
const auth = require('../middlewares/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const { getAcheteursWithAchats, getAllAcheteurs } = require("../controllers/userController");

// Liste des utilisateurs (option de filtrage par rôle)
// router.get('/', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.getAllUsers);
router.get('/', userController.getAllUsers);
router.get("/acheteurs/achats", getAcheteursWithAchats);
router.get("/acheteurs/all", getAllAcheteurs);
// Création d'un utilisateur (chauffeur, admin, etc.)
router.post('/', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.createUser);
// Détail d'un utilisateur
router.get('/:id', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.getUserById);
// Mise à jour d'un utilisateur
router.put('/:id', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.updateUser);
// Suppression d'un utilisateur
router.delete('/:id', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.deleteUser);
// Mise à jour du mot de passe d'un utilisateur (ANCIEN - désactivé pour éviter conflits)
// router.put('/:id/password', roleMiddleware('superAdmin', 'principal', 'gestionnaire', 'admin'), userController.updatePassword);

// Route pour upload photo de profil (chemin conservé pour compatibilité)
router.post('/users/photo', auth, upload.single('photo'), userController.uploadProfilePhoto);

// Mettre à jour le profil de l'utilisateur connecté
router.patch('/me', auth, userController.updateMe);

// Mettre à jour le mot de passe de l'utilisateur connecté
router.patch('/password', auth, userController.updateMyPassword);

// Route pour mettre à jour le token FCM
router.post('/fcm-token', auth, userController.updateFcmToken);

// Récupérer les activités d'un chauffeur
router.get('/:id/activites', roleMiddleware('superAdmin', 'principal', 'gestionnaire', 'admin'), userController.getChauffeurActivities);

module.exports = router; 