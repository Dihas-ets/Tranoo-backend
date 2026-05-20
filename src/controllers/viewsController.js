const Article = require('../models/Article');
const { normalizeArticleViews } = require('../utils/articleViews');

function viewsPayload(article) {
  const data = normalizeArticleViews(article);
  return {
    views: data.views,
    viewsReal: data.viewsReal,
    viewsAuto: data.viewsAuto,
    lastViewed: data.lastViewed,
    titre: data.titre,
  };
}

// Enregistrer une vue réelle (clic utilisateur)
exports.recordView = async (req, res) => {
  try {
    const { articleId } = req.params;

    if (!articleId) {
      return res.status(400).json({ message: "ID d'article requis" });
    }

    const article = await Article.findById(articleId);
    if (!article) {
      return res.status(404).json({ message: 'Article non trouvé' });
    }

    article.viewsReal = (article.viewsReal || 0) + 1;
    article.lastViewed = new Date();
    await article.save();

    const payload = viewsPayload(article);
    res.json({
      success: true,
      ...payload,
      message: 'Vue enregistrée avec succès',
    });
  } catch (error) {
    console.error('Erreur enregistrement vue:', error);
    res.status(500).json({ message: "Erreur lors de l'enregistrement de la vue", error: error.message });
  }
};

exports.getArticleViews = async (req, res) => {
  try {
    const { articleId } = req.params;

    if (!articleId) {
      return res.status(400).json({ message: "ID d'article requis" });
    }

    const article = await Article.findById(articleId).select(
      'views viewsReal viewsAuto lastViewed titre'
    );

    if (!article) {
      return res.status(404).json({ message: 'Article non trouvé' });
    }

    res.json({
      success: true,
      ...viewsPayload(article),
    });
  } catch (error) {
    console.error('Erreur récupération vues:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des vues', error: error.message });
  }
};

exports.getMostViewedArticles = async (req, res) => {
  try {
    const { limit = 10, type } = req.query;

    const filter = {
      statut: 'en_ligne',
      recommande: true,
    };

    if (type && (type === 'voiture' || type === 'piece')) {
      filter.type = type;
    }

    const articles = await Article.find(filter)
      .select('titre prix photos marque modele annee views viewsReal viewsAuto lastViewed type')
      .sort({ views: -1 })
      .limit(parseInt(limit, 10));

    res.json({
      success: true,
      articles: articles.map((article) => normalizeArticleViews(article)),
    });
  } catch (error) {
    console.error('Erreur articles les plus vus:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des articles populaires', error: error.message });
  }
};

exports.batchUpdateViews = async (req, res) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'Format de mise à jour invalide' });
    }

    const bulkOps = updates.map((update) => ({
      updateOne: {
        filter: { _id: update.articleId },
        update: {
          $set: {
            viewsReal: update.viewsReal ?? update.views ?? 0,
            viewsAuto: update.viewsAuto ?? 0,
          },
        },
        upsert: false,
      },
    }));

    const result = await Article.bulkWrite(bulkOps);

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: `${result.modifiedCount} articles mis à jour`,
    });
  } catch (error) {
    console.error('Erreur mise à jour lot vues:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour en lot', error: error.message });
  }
};
