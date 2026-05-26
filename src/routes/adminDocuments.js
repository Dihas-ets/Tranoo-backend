const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const role = require('../middlewares/role');
const documentController = require('../controllers/documentController');

router.get(
  '/',
  auth,
  role('superAdmin', 'principal', 'gestionnaire', 'admin'),
  documentController.listAdminDocuments
);

module.exports = router;
