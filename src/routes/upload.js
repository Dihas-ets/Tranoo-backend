const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/uploadController');

// Upload + transcodage vidéo (auth obligatoire)
router.post(
  '/video',
  uploadController.videoUploadMiddleware,
  uploadController.uploadAndTranscodeVideo
);

module.exports = router;

