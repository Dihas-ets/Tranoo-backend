// +50 vues auto chaque heure complète tant que l'article est en_ligne (sans plafond final).
const VIEWS_PER_HOUR = Math.max(
  1,
  parseInt(process.env.AUTO_VIEWS_PER_HOUR || process.env.AUTO_VIEWS_TARGET || '50', 10) || 50,
);
const HOUR_MS = 60 * 60 * 1000;

function normalizeArticleViews(doc) {
  const data = doc && doc.toObject ? doc.toObject() : { ...(doc || {}) };
  let viewsReal = Number(data.viewsReal) || 0;
  let viewsAuto = Number(data.viewsAuto) || 0;
  const legacyViews = Number(data.views) || 0;

  if (viewsReal === 0 && viewsAuto === 0 && legacyViews > 0) {
    viewsReal = legacyViews;
  }

  return {
    ...data,
    viewsReal,
    viewsAuto,
    views: viewsReal + viewsAuto,
  };
}

/** (Re)démarre le compteur horaire quand l'article passe en ligne. */
function initAutoViewsSchedule(article, { resetTimer = true } = {}) {
  article.viewsReal = article.viewsReal || 0;
  article.viewsAuto = article.viewsAuto || 0;
  article.autoViewsTarget = VIEWS_PER_HOUR;
  if (resetTimer || !article.autoViewsStartedAt) {
    article.autoViewsStartedAt = new Date();
  }
  article.autoViewsCompleted = false;
  article.views = (article.viewsReal || 0) + (article.viewsAuto || 0);
}

async function tickAutoViewsForArticles() {
  const Article = require('../models/Article');
  const now = Date.now();
  const articles = await Article.find({ statut: 'en_ligne' });

  let updated = 0;
  for (const article of articles) {
    if (!article.autoViewsStartedAt) {
      article.autoViewsStartedAt = new Date();
      article.autoViewsTarget = VIEWS_PER_HOUR;
      article.autoViewsCompleted = false;
      article.viewsAuto = article.viewsAuto || 0;
      await article.save();
      updated += 1;
      continue;
    }

    const startedAt = new Date(article.autoViewsStartedAt).getTime();
    const elapsedMs = Math.max(0, now - startedAt);
    // Progression continue : ~50 vues/heure (visible dès la 1ère minute).
    const expectedAuto = Math.floor((elapsedMs / HOUR_MS) * VIEWS_PER_HOUR);
    const currentAuto = article.viewsAuto || 0;

    if (currentAuto < expectedAuto) {
      article.viewsAuto = expectedAuto;
      article.autoViewsTarget = VIEWS_PER_HOUR;
      article.autoViewsCompleted = false;
      article.views = (article.viewsReal || 0) + article.viewsAuto;
      await article.save();
      updated += 1;
    }
  }

  if (updated > 0) {
    console.log(`[AUTO_VIEWS] ${updated} article(s) +${VIEWS_PER_HOUR}/h (total heures comptées)`);
  }
}

module.exports = {
  VIEWS_PER_HOUR,
  HOUR_MS,
  normalizeArticleViews,
  initAutoViewsSchedule,
  tickAutoViewsForArticles,
};
