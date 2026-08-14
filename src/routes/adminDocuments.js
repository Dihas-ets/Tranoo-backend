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

router.get(
  '/:id/download',
  auth,
  role('superAdmin', 'principal', 'gestionnaire', 'admin'),
  documentController.downloadAdminDocument
);

router.post(
  '/bulk-delete',
  auth,
  role('superAdmin', 'principal', 'gestionnaire', 'admin'),
  documentController.deleteAdminDocuments
);

module.exports = router;
