const TransitaireReview = require('../models/TransitaireReview');
const User = require('../models/User');
const mongoose = require('mongoose');
const { getTransitaireRatingStats } = require('../utils/transitaireRating');

function formatReview(doc) {
  if (!doc) return null;
  const r = doc.toObject ? doc.toObject() : doc;
  const reviewer = r.reviewer;
  let reviewerName = 'Utilisateur';
  if (reviewer && typeof reviewer === 'object') {
    const prenoms = (reviewer.prenoms || '').toString().trim();
    const nom = (reviewer.nom || '').toString().trim();
    reviewerName = `${prenoms} ${nom}`.trim() || reviewerName;
  }
  return {
    _id: r._id,
    transitaire: r.transitaire,
    reviewer: r.reviewer?._id || r.reviewer,
    reviewerName,
    reviewerPhoto: reviewer?.photo || null,
    rating: r.rating,
    comment: r.comment || '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

exports.listByTransitaire = async (req, res) => {
  try {
    const { transitaireId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(transitaireId)) {
      return res.status(400).json({ message: 'ID transitaire invalide' });
    }

    const transitaire = await User.findById(transitaireId).lean();
    if (!transitaire || transitaire.role !== 'transitaire') {
      return res.status(404).json({ message: 'Transitaire introuvable' });
    }

    const reviews = await TransitaireReview.find({ transitaire: transitaireId })
      .populate('reviewer', 'nom prenoms photo')
      .sort({ createdAt: -1 })
      .lean();

    const stats = await getTransitaireRatingStats(transitaireId);

    let myReview = null;
    if (req.user?._id) {
      const mine = await TransitaireReview.findOne({
        transitaire: transitaireId,
        reviewer: req.user._id,
      })
        .populate('reviewer', 'nom prenoms photo')
        .lean();
      if (mine) myReview = formatReview(mine);
    }

    return res.json({
      ...stats,
      reviews: reviews.map(formatReview),
      myReview,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

exports.listReceived = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const user = await User.findById(userId).lean();
    if (!user || user.role !== 'transitaire') {
      return res.status(403).json({ message: 'Réservé aux transitaires' });
    }

    const reviews = await TransitaireReview.find({ transitaire: userId })
      .populate('reviewer', 'nom prenoms photo')
      .sort({ createdAt: -1 })
      .lean();

    const stats = await getTransitaireRatingStats(userId);

    return res.json({
      ...stats,
      reviews: reviews.map(formatReview),
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

exports.createOrUpdate = async (req, res) => {
  try {
    const reviewerId = req.user?._id;
    if (!reviewerId) return res.status(401).json({ message: 'Non authentifié' });

    const { transitaireId, rating, comment } = req.body || {};
    if (!transitaireId || !mongoose.Types.ObjectId.isValid(transitaireId)) {
      return res.status(400).json({ message: 'ID transitaire requis' });
    }

    const parsedRating = Number(rating);
    if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ message: 'Note invalide (1 à 5)' });
    }

    const transitaire = await User.findById(transitaireId).lean();
    if (!transitaire || transitaire.role !== 'transitaire') {
      return res.status(404).json({ message: 'Transitaire introuvable' });
    }

    if (transitaireId.toString() === reviewerId.toString()) {
      return res.status(400).json({ message: 'Vous ne pouvez pas vous noter vous-même' });
    }

    const review = await TransitaireReview.findOneAndUpdate(
      { transitaire: transitaireId, reviewer: reviewerId },
      {
        $set: {
          rating: Math.round(parsedRating),
          comment: (comment || '').toString().trim().slice(0, 500),
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { new: true, upsert: true }
    ).populate('reviewer', 'nom prenoms photo');

    const stats = await getTransitaireRatingStats(transitaireId);

    return res.status(200).json({
      message: 'Avis enregistré',
      review: formatReview(review),
      ...stats,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Avis déjà existant' });
    }
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const reviewerId = req.user?._id;
    if (!reviewerId) return res.status(401).json({ message: 'Non authentifié' });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID avis invalide' });
    }

    const review = await TransitaireReview.findById(id);
    if (!review) return res.status(404).json({ message: 'Avis introuvable' });
    if (review.reviewer.toString() !== reviewerId.toString()) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const { rating, comment } = req.body || {};
    if (rating !== undefined) {
      const parsedRating = Number(rating);
      if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return res.status(400).json({ message: 'Note invalide (1 à 5)' });
      }
      review.rating = Math.round(parsedRating);
    }
    if (comment !== undefined) {
      review.comment = comment.toString().trim().slice(0, 500);
    }
    review.updatedAt = new Date();
    await review.save();
    await review.populate('reviewer', 'nom prenoms photo');

    const stats = await getTransitaireRatingStats(review.transitaire);

    return res.json({
      message: 'Avis mis à jour',
      review: formatReview(review),
      ...stats,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Non authentifié' });

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'ID avis invalide' });
    }

    const review = await TransitaireReview.findById(id);
    if (!review) return res.status(404).json({ message: 'Avis introuvable' });

    const isReviewer = review.reviewer.toString() === userId.toString();
    const isTransitaireOwner = review.transitaire.toString() === userId.toString();
    if (!isReviewer && !isTransitaireOwner) {
      return res.status(403).json({ message: 'Non autorisé' });
    }

    const transitaireId = review.transitaire;
    await review.deleteOne();

    const stats = await getTransitaireRatingStats(transitaireId);

    return res.json({ message: 'Avis supprimé', ...stats });
  } catch (error) {
    return res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};
