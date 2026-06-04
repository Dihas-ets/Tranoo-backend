const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const verificationController = require('../controllers/verificationController');

router.post('/request', auth, verificationController.requestVerification);

module.exports = router;
