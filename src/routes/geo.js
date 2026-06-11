const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/geoController');

router.get('/countries', ctrl.suggestCountries);
router.post('/normalize', ctrl.normalizeLocation);

module.exports = router;
