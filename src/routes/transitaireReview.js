const express = require('express');
const router = express.Router();
const transitaireReviewController = require('../controllers/transitaireReviewController');

router.get('/transitaire/:transitaireId', transitaireReviewController.listByTransitaire);
router.get('/received', transitaireReviewController.listReceived);
router.post('/', transitaireReviewController.createOrUpdate);
router.put('/:id', transitaireReviewController.updateReview);
router.delete('/:id', transitaireReviewController.deleteReview);

module.exports = router;
