const Article = require('../models/Article');

// Enregistrer une vue pour un article
exports.recordView = async (req, res) => {
  try {
    const { articleId } = req.params;
    const userId = req.user?.uid || req.user?.id;

    if (!articleId) {
      return res.status(400).json({ message: 'ID d\'article requis' });
    }

    // Mettre à jour le compteur de vues
    const article = await Article.findByIdAndUpdate(
      articleId,
      {
        $inc: { views: 1 },
        lastViewed: new Date()
      },
      { new: true, upsert: false }
    );

    if (!article) {
      return res.status(404).json({ message: 'Article non trouvé' });
    }

    res.json({
      success: true,
      views: article.views,
      message: 'Vue enregistrée avec succès'
    });
  } catch (error) {
    console.error('Erreur enregistrement vue:', error);
    res.status(500).json({ message: 'Erreur lors de l\'enregistrement de la vue', error: error.message });
  }
};

// Obtenir les statistiques de vues pour un article
exports.getArticleViews = async (req, res) => {
  try {
    const { articleId } = req.params;

    if (!articleId) {
      return res.status(400).json({ message: 'ID d\'article requis' });
    }

    const article = await Article.findById(articleId).select('views lastViewed titre');

    if (!article) {
      return res.status(404).json({ message: 'Article non trouvé' });
    }

    res.json({
      success: true,
      views: article.views || 0,
      lastViewed: article.lastViewed,
      titre: article.titre
    });
  } catch (error) {
    console.error('Erreur récupération vues:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des vues', error: error.message });
  }
};

// Obtenir les articles les plus vus (pour la section recommandé)
exports.getMostViewedArticles = async (req, res) => {
  try {
    const { limit = 10, type } = req.query;
    
    // Construire le filtre
    const filter = { 
      statut: 'en_ligne',
      recommande: true 
    };
    
    if (type && (type === 'voiture' || type === 'piece')) {
      filter.type = type;
    }

    const articles = await Article.find(filter)
      .select('titre prix photos marque modele annee views lastViewed type')
      .sort({ views: -1 }) // Trier par nombre de vues décroissant
      .limit(parseInt(limit));

    res.json({
      success: true,
      articles: articles.map(article => ({
        ...article.toObject(),
        views: article.views || 0
      }))
    });
  } catch (error) {
    console.error('Erreur articles les plus vus:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des articles populaires', error: error.message });
  }
};

// Mettre à jour les vues en lot (pour l'initialisation)
exports.batchUpdateViews = async (req, res) => {
  try {
    const { updates } = req.body; // [{ articleId: 'xxx', views: 5 }, ...]

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: 'Format de mise à jour invalide' });
    }

    const bulkOps = updates.map(update => ({
      updateOne: {
        filter: { _id: update.articleId },
        update: { 
          $set: { views: update.views || 0 },
          $setOnInsert: { lastViewed: new Date() }
        },
        upsert: false
      }
    }));

    const result = await Article.bulkWrite(bulkOps);

    res.json({
      success: true,
      modifiedCount: result.modifiedCount,
      message: `${result.modifiedCount} articles mis à jour`
    });
  } catch (error) {
    console.error('Erreur mise à jour lot vues:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour en lot', error: error.message });
  }
};
