const TransitaireReview = require('../models/TransitaireReview');
const mongoose = require('mongoose');

async function getTransitaireRatingStats(transitaireId) {
  const id = transitaireId?.toString?.() || transitaireId;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { ratingAverage: 0, reviewCount: 0 };
  }
  const stats = await TransitaireReview.aggregate([
    { $match: { transitaire: new mongoose.Types.ObjectId(id) } },
    {
      $group: {
        _id: null,
        ratingAverage: { $avg: '$rating' },
        reviewCount: { $sum: 1 },
      },
    },
  ]);
  if (!stats.length) {
    return { ratingAverage: 0, reviewCount: 0 };
  }
  return {
    ratingAverage: Math.round(stats[0].ratingAverage * 10) / 10,
    reviewCount: stats[0].reviewCount,
  };
}

async function attachRatingStats(userObj) {
  if (!userObj || !userObj._id) return userObj;
  const stats = await getTransitaireRatingStats(userObj._id);
  userObj.ratingAverage = stats.ratingAverage;
  userObj.reviewCount = stats.reviewCount;
  return userObj;
}

module.exports = {
  getTransitaireRatingStats,
  attachRatingStats,
};
