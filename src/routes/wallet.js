const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');

router.get('/me', walletController.getMyWallet);
router.get('/me/transactions', walletController.getMyTransactions);

module.exports = router;







