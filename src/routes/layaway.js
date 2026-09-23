const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/role');
const layawayVehicleController = require('../controllers/layawayVehicleController');
const layawayDossierController = require('../controllers/layawayDossierController');
const layawayContractController = require('../controllers/layawayContractController');
const layawayPaymentController = require('../controllers/layawayPaymentController');
const layawayDeliveryController = require('../controllers/layawayDeliveryController');
const layawayCompletionController = require('../controllers/layawayCompletionController');
const layawayCancellationController = require('../controllers/layawayCancellationController');

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
router.post(
  '/admin/dossiers/:id/delivery/validate',
  ...adminOnly,
  layawayDeliveryController.validateDelivery,
);
router.post(
  '/admin/dossiers/:id/delivery/reject',
  ...adminOnly,
  layawayDeliveryController.rejectDelivery,
);
router.get(
  '/admin/dossiers/:id/payout',
  ...adminOnly,
  layawayCompletionController.getPayout,
);
router.post(
  '/admin/dossiers/:id/payout/mark-paid',
  ...adminOnly,
  layawayCompletionController.markPayoutPaid,
);
router.post(
  '/admin/dossiers/:id/close',
  ...adminOnly,
  layawayCompletionController.closeDossier,
);
router.post(
  '/admin/dossiers/:id/cancellation/approve',
  ...adminOnly,
  layawayCancellationController.approveCancellation,
);
router.post(
  '/admin/dossiers/:id/cancellation/reject',
  ...adminOnly,
  layawayCancellationController.rejectCancellation,
);
router.post(
  '/admin/dossiers/:id/cancellation/execute-refund',
  ...adminOnly,
  layawayCancellationController.executeRefund,
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

// --- Paiements (min = dû ; surplus → échéances suivantes) ---
router.get(
  '/dossiers/:id/payments/quote',
  ...buyerAuth,
  layawayPaymentController.quotePayment,
);
router.post(
  '/dossiers/:id/payments',
  ...buyerAuth,
  layawayPaymentController.createPaymentIntent,
);
router.get(
  '/dossiers/:id/payments',
  ...buyerAuth,
  layawayPaymentController.listPayments,
);

// --- Remise / facture (fin de parcours) ---
router.get(
  '/dossiers/:id/delivery',
  ...buyerAuth,
  layawayDeliveryController.getDelivery,
);
router.post(
  '/dossiers/:id/delivery',
  ...buyerAuth,
  layawayDeliveryController.submitDelivery,
);
router.get(
  '/dossiers/:id/invoice',
  ...buyerAuth,
  layawayCompletionController.getInvoice,
);

// --- Annulation / remboursement ---
router.get(
  '/dossiers/:id/cancellation',
  ...buyerAuth,
  layawayCancellationController.getCancellation,
);
router.post(
  '/dossiers/:id/cancellation',
  ...buyerAuth,
  layawayCancellationController.requestCancellation,
);

module.exports = router;
