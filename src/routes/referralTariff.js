const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');
const ctrl = require('../controllers/referralTariffController');

// Public/list for authenticated users (for dashboard table)
router.get('/', auth, ctrl.listTariffs);

// Admin-only CRUD
router.post('/', auth, role('superAdmin', 'principal', 'gestionnaire'), ctrl.createTariff);
router.put('/:id', auth, role('superAdmin', 'principal', 'gestionnaire'), ctrl.updateTariff);
router.delete('/:id', auth, role('superAdmin', 'principal', 'gestionnaire'), ctrl.deleteTariff);

module.exports = router;


