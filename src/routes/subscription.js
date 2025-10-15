const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subscriptionController');

// Auth middleware appliqué dans app.js
router.get('/me', ctrl.getMySubscription);
router.post('/subscribe', ctrl.subscribe);
router.get('/status/:userId', ctrl.getUserSubscriptionStatus);

module.exports = router;




