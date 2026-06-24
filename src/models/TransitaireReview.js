const mongoose = require('mongoose');

const TransitaireReviewSchema = new mongoose.Schema({
  transitaire: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  reviewer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', maxlength: 500, trim: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

TransitaireReviewSchema.index({ transitaire: 1, reviewer: 1 }, { unique: true });

module.exports = mongoose.model('TransitaireReview', TransitaireReviewSchema);
