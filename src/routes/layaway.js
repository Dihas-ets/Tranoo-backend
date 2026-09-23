const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/role');
const layawayVehicleController = require('../controllers/layawayVehicleController');
const layawayDossierController = require('../controllers/layawayDossierController');
const layawayContractController = require('../controllers/layawayContractController');

const adminOnly = [
  authMiddleware,
  roleMiddleware(
    'admin',
    'superAdmin',
    'principal',
    'moderateur',
    'gestionnaire',
    'responsablePaiement',
    'responsableService',
  ),
];

const buyerAuth = [authMiddleware];

// --- Admin (section Layaway dashboard) ---
router.get('/admin/vehicles', ...adminOnly, layawayVehicleController.listAdminVehicles);
router.post('/admin/vehicles', ...adminOnly, layawayVehicleController.createVehicle);
router.get('/admin/vehicles/:id', ...adminOnly, layawayVehicleController.getVehicle);
router.patch('/admin/vehicles/:id', ...adminOnly, layawayVehicleController.updateVehicle);
router.delete('/admin/vehicles/:id', ...adminOnly, layawayVehicleController.deleteVehicle);
router.post(
  '/admin/vehicles/:id/publish',
  ...adminOnly,
  layawayVehicleController.publishVehicle,
);
router.post(
  '/admin/vehicles/:id/withdraw',
  ...adminOnly,
  layawayVehicleController.withdrawVehicle,
);
router.patch(
  '/admin/vehicles/:id/publication-status',
  ...adminOnly,
  layawayVehicleController.setPublicationStatus,
);
router.put(
  '/admin/dossiers/:id/contract/document',
  ...adminOnly,
  layawayContractController.attachDocument,
);

// --- Acheteur / public catalogue Layaway (PUBLIE uniquement) ---
router.get('/vehicles', layawayVehicleController.listBuyerVehicles);
router.get('/vehicles/:id', layawayVehicleController.getVehicle);

// --- Dossiers Layaway (acheteur) ---
router.post('/dossiers/preview', ...buyerAuth, layawayDossierController.previewDossier);
router.post('/dossiers', ...buyerAuth, layawayDossierController.createDossier);
router.get('/dossiers', ...buyerAuth, layawayDossierController.listMyDossiers);
router.get('/dossiers/:id', ...buyerAuth, layawayDossierController.getMyDossier);
router.get('/dossiers/:id/schedule', ...buyerAuth, layawayDossierController.getMySchedule);
router.get('/dossiers/:id/contract', ...buyerAuth, layawayContractController.getContract);
router.post(
  '/dossiers/:id/contract/sign',
  ...buyerAuth,
  layawayContractController.signContract,
);

module.exports = router;
