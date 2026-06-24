const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

router.get('/me', (req, res) => {
  const u = req.user.toObject ? req.user.toObject() : { ...req.user };
  delete u.password;
  res.json({ user: u });
});

router.get('/stats', statsController.getStats);
router.get('/stats/acheteurs', statsController.getAcheteursStats);
router.get('/stats/dashboard-finance', statsController.getDashboardFinance);
router.get('/stats/seller-marque', statsController.getSellerMarqueStats);
router.get('/stats/nav-badges', statsController.getAdminNavBadges);
router.post('/stats/nav-badges/mark-seen', statsController.markAdminNavSeen);
router.get('/stats/livreurs', statsController.getLivreursStats);

module.exports = router; 