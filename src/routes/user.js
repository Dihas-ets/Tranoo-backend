const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const roleMiddleware = require('../middlewares/role');
const { getAcheteursWithAchats } = require("../controllers/userController");

// Liste des utilisateurs (option de filtrage par rôle)
// router.get('/', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.getAllUsers);
router.get('/', userController.getAllUsers);
router.get("/acheteurs/achats", getAcheteursWithAchats);
// Détail d'un utilisateur
router.get('/:id', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.getUserById);
// Mise à jour d'un utilisateur
router.put('/:id', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.updateUser);
// Suppression d'un utilisateur
router.delete('/:id', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), userController.deleteUser);
// Mise à jour du mot de passe d'un utilisateur
router.put('/:id/password', roleMiddleware('superAdmin', 'principal', 'gestionnaire', 'admin'), userController.updatePassword);

module.exports = router; 