const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');
const livreurBalanceController = require('../controllers/livreurBalanceController');

// Toutes les routes nécessitent une authentification
router.use(auth);

// Livreur connecté : voir sa balance
router.get('/me', livreurBalanceController.getMyBalance);

// Livreur connecté : voir ses transactions
router.get('/me/transactions', livreurBalanceController.getMyTransactions);

// Admin : voir la balance d'un livreur spécifique
router.get(
  '/:id',
  role('admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'),
  livreurBalanceController.getLivreurBalanceForAdmin
);

// Admin : liste paginée de toutes les balances livreurs
router.get(
  '/',
  role('admin', 'superAdmin', 'principal', 'gestionnaire', 'responsablePaiement'),
  livreurBalanceController.getAllLivreurBalancesForAdmin
);

module.exports = router;

