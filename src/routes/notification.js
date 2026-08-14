const express = require('express');
const router = express.Router();
const multer = require('multer');
const notificationController = require('../controllers/notificationController');
const auth = require('../middlewares/auth');
const roleMiddleware = require('../middlewares/role');

const verificationPdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname || '')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers PDF sont acceptés'));
    }
  },
});

// Route de test (à supprimer en production) - SANS AUTH POUR LES TESTS
router.post('/test', notificationController.testNotification);

// Toutes les autres routes nécessitent une authentification
router.use(auth);

// Récupérer les notifications de l'utilisateur
router.get('/', notificationController.getUserNotifications);

// Obtenir le nombre de notifications non lues
router.get('/unread-count', notificationController.getUnreadCount);

// Marquer une notification comme lue
router.put('/:notificationId/read', notificationController.markAsRead);

// Marquer une notification comme non lue
router.put('/:notificationId/unread', notificationController.markAsUnread);

// Marquer toutes les notifications comme lues
router.put('/mark-all-read', notificationController.markAllAsRead);

// Supprimer une notification
router.delete('/:notificationId', notificationController.deleteNotification);

// ===== NOUVELLES ROUTES POUR LES VÉRIFICATIONS =====

// Traiter l'action de vérification (approve/reject)
router.post('/:notificationId/verification-action', notificationController.handleVerificationActionHTTP);

// Créer une notification de vérification (Admin uniquement)
router.post('/verification', roleMiddleware('superAdmin', 'principal', 'gestionnaire'), notificationController.createVerificationNotificationHTTP);

// Envoyer un message admin générique (Admin: plusieurs rôles)
router.post(
  '/admin-message',
  roleMiddleware('superAdmin', 'principal', 'gestionnaire', 'moderateur', 'marketing', 'responsableService'),
  notificationController.createAdminMessageHTTP
);

// Historique des messages envoyés depuis le dashboard admin
router.get(
  '/admin-messages/history',
  roleMiddleware('superAdmin', 'principal', 'gestionnaire', 'moderateur', 'marketing', 'responsableService', 'admin'),
  notificationController.getAdminMessageHistory
);

// PDF vérification — upload serveur (API secret Cloudinary, URL accessible Meta/WhatsApp)
router.post(
  '/verification-pdf',
  roleMiddleware('superAdmin', 'principal', 'gestionnaire', 'moderateur', 'marketing', 'responsableService'),
  verificationPdfUpload.single('pdf'),
  notificationController.uploadVerificationPdfHTTP
);

// Demande de recherche véhicule par acheteur (notifie les vendeurs)
router.post('/search-request', notificationController.createVehicleSearchRequestHTTP);
// Demande de recherche piece par acheteur (notifie les vendeurs)
router.post('/piece-search-request', notificationController.createPieceSearchRequestHTTP);

module.exports = router;
