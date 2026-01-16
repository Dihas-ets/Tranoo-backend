const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const auth = require('../middlewares/auth');

// Récupérer les paramètres de l'utilisateur
router.get('/', auth, settingsController.getSettings);

// Mettre à jour les paramètres de l'utilisateur
router.patch('/', auth, settingsController.updateSettings);

// Mettre à jour la langue
router.patch('/language', auth, settingsController.updateLanguage);

// Mettre à jour la devise
router.patch('/currency', auth, settingsController.updateCurrency);

// Mettre à jour les préférences de notification
router.patch('/notifications', auth, settingsController.updateNotificationSettings);

module.exports = router;

