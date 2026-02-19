const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/geoBeninController');

// /api/geo/benin/departements
router.get('/departements', ctrl.getDepartements);
// /api/geo/benin/communes?departement=Atlantique
router.get('/communes', ctrl.getCommunes);
// /api/geo/benin/villes?commune=Abomey-Calavi
router.get('/villes', ctrl.getVilles);
// /api/geo/benin/quartiers?ville=Fidjrossè
router.get('/quartiers', ctrl.getQuartiers);

module.exports = router;

