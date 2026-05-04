const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const demoEventController = require('../controllers/demoEventController');

router.post('/track', auth, demoEventController.track);

module.exports = router;

