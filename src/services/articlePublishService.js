const User = require('../models/User');
const { initAutoViewsSchedule } = require('../utils/articleViews');

// Comptes dashboard : role Mongo = "admin" (sous-types dans typeAdmin)
const ADMIN_ROLES = ['admin'];

function buildArticleMeta(article) {
  const isPiece = (article.type || '').toString().toLowerCase() === 'piece';
  const typeLabel = isPiece ? 'pièce' : 'véhicule';
  const prix =
    article.prix != null && article.prix !== ''
      ? ` — ${Number(article.prix).toLocaleString('fr-FR')} FCFA`
      : '';
  const detailPath = isPiece ? 'mastervac' : 'cars_info';
  const thumb =
    Array.isArray(article.photos) && article.photos.length > 0
      ? article.photos[0]
      : '';

  return {
    isPiece,
    typeLabel,
    prix,
    detailPath,
    thumb,
    titre: article.titre || 'Nouvelle annonce',
  };
}

async function notifyUsersInBatches(users, notifyFn) {
  const batchSize = 25;
  for (let i = 0; i < users.length; i += batchSize) {
    const chunk = users.slice(i, i + batchSize);
    await Promise.all(chunk.map((u) => notifyFn(u).catch(() => null)));
  }
}

/**
 * Acheteurs Tranoo : nouvelle annonce disponible.
 */
async function notifyBuyersNewArticle(article, sellerId) {
  const notificationController = require('../controllers/notificationController');
  const { typeLabel, prix, detailPath, thumb, titre } = buildArticleMeta(article);
  const title = `Nouveau ${typeLabel} disponible`;
  const message = `${titre}${prix}`;

  const buyers = await User.find({
    _id: { $ne: sellerId },
    isBlocked: { $ne: true },
    role: 'acheteur',
  })
    .select('_id')
    .lean();

  await notifyUsersInBatches(buyers, (u) =>
    notificationController.createNotification(
      u._id,
      sellerId,
      title,
      message,
      'new_article',
      article._id,
      'Article',
      {
        audience: 'buyer',
        action: 'view_article',
        targetArticleId: String(article._id),
        targetType: article.type,
        targetPath: detailPath,
        articleTitle: titre,
        thumbnailUrl: thumb,
      }
    )
  );

  console.log(
    `[NOTIFY_NEW_ARTICLE][BUYERS] ${buyers.length} acheteur(s) notifié(s) pour article ${article._id}`
  );
}

/**
 * Vendeur : confirmation de publication.
 */
async function notifySellerArticlePublished(article, sellerId) {
  const notificationController = require('../controllers/notificationController');
  const { typeLabel, prix, detailPath, thumb, titre } = buildArticleMeta(article);
  const title = 'Article publié';
  const message = `Votre ${typeLabel} « ${titre} » est maintenant en ligne${prix}.`;

  await notificationController.createNotification(
    sellerId,
    'system',
    title,
    message,
    'new_article',
    article._id,
    'Article',
    {
      audience: 'seller',
      action: 'view_my_article',
      targetArticleId: String(article._id),
      targetType: article.type,
      targetPath: detailPath,
      articleTitle: titre,
      thumbnailUrl: thumb,
    }
  );

  console.log(
    `[NOTIFY_NEW_ARTICLE][SELLER] vendeur ${sellerId} notifié pour article ${article._id}`
  );
}

/**
 * Admins dashboard : nouvel article mis en ligne.
 */
async function notifyAdminsNewArticle(article, sellerId) {
  const notificationController = require('../controllers/notificationController');
  const { typeLabel, prix, detailPath, thumb, titre } = buildArticleMeta(article);
  const title = `Nouvel article ${typeLabel}`;
  const message = `Un vendeur a publié: « ${titre} »${prix}`;

  const admins = await User.find({
    isBlocked: { $ne: true },
    role: { $in: ADMIN_ROLES },
  })
    .select('_id')
    .lean();

  await notifyUsersInBatches(admins, (u) =>
    notificationController.createNotification(
      u._id,
      sellerId,
      title,
      message,
      'new_article',
      article._id,
      'Article',
      {
        audience: 'admin',
        action: 'view_article',
        targetArticleId: String(article._id),
        targetType: article.type,
        targetPath: detailPath,
        articleTitle: titre,
        thumbnailUrl: thumb,
      }
    )
  );

  console.log(
    `[NOTIFY_NEW_ARTICLE][ADMINS] ${admins.length} admin(s) notifié(s) pour article ${article._id}`
  );
}

/**
 * Orchestration : acheteurs + vendeur (confirmation) + admins.
 */
async function notifyAllTranooUsersNewArticle(article, sellerId) {
  await Promise.all([
    notifyBuyersNewArticle(article, sellerId),
    notifySellerArticlePublished(article, sellerId),
    notifyAdminsNewArticle(article, sellerId),
  ]);
}

function scheduleNewArticleSideEffects(article, sellerId) {
  setImmediate(async () => {
    try {
      await notifyAllTranooUsersNewArticle(article, sellerId);
    } catch (err) {
      console.error('[ARTICLE_PUBLISH] Notification broadcast failed:', err);
    }
  });
}

module.exports = {
  notifyBuyersNewArticle,
  notifySellerArticlePublished,
  notifyAdminsNewArticle,
  notifyAllTranooUsersNewArticle,
  scheduleNewArticleSideEffects,
  initAutoViewsSchedule,
};
