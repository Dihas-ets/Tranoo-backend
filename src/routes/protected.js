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

module.exports = router; 