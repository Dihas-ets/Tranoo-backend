const express = require('express');
const router = express.Router();
const layawaySettingsController = require('../controllers/layawaySettingsController');

router.get('/', layawaySettingsController.getLayawaySettings);
router.put('/', layawaySettingsController.updateLayawaySettings);
router.patch('/', layawaySettingsController.updateLayawaySettings);

module.exports = router;
