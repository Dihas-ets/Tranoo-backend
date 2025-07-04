const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

router.get('/stats', statsController.getStats);

module.exports = router; 