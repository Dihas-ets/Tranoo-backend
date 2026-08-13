// Vues auto : rythme horaire moyen, mais décalé et irrégulier par article
// pour éviter que tous les listings affichent le même compteur au même instant.
const VIEWS_PER_HOUR = Math.max(
  1,
  parseInt(process.env.AUTO_VIEWS_PER_HOUR || process.env.AUTO_VIEWS_TARGET || '50', 10) || 50,
);
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function hashId(id) {
  const s = String(id || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 28–72 vues/heure selon l'id, autour de VIEWS_PER_HOUR. */
function rateForArticle(article) {
  const h = hashId(article?._id);
  const spread = 22;
  const base = Math.max(18, VIEWS_PER_HOUR - spread);
  return base + (h % (spread * 2 + 1));
}

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
  const rate = rateForArticle(article);
  article.autoViewsTarget = rate;
  if (resetTimer || !article.autoViewsStartedAt) {
    const h = hashId(article._id);
    // Décalage 0–29 min pour que les articles publiés ensemble ne démarrent pas au même tick.
    const delayMin = h % 30;
    article.autoViewsStartedAt = new Date(Date.now() + delayMin * MINUTE_MS);
  }
  article.autoViewsCompleted = false;
  article.views = (article.viewsReal || 0) + (article.viewsAuto || 0);
}

async function tickAutoViewsForArticles() {
  const Article = require('../models/Article');
  const now = Date.now();
  const minute = Math.floor(now / MINUTE_MS);
  const articles = await Article.find({ statut: 'en_ligne' });

  let updated = 0;
  for (const article of articles) {
    const h = hashId(article._id);
    const rate = rateForArticle(article);

    if (!article.autoViewsStartedAt) {
      const delayMin = h % 30;
      article.autoViewsStartedAt = new Date(now + delayMin * MINUTE_MS);
      article.autoViewsTarget = rate;
      article.autoViewsCompleted = false;
      article.viewsAuto = article.viewsAuto || 0;
      await article.save();
      updated += 1;
      continue;
    }

    const startedAt = new Date(article.autoViewsStartedAt).getTime();
    if (now < startedAt) continue;

    // ~2 ticks sur 3, motif différent par article → pas d'incrément simultané.
    if ((minute + (h % 7)) % 3 === 0) continue;

    const elapsedHours = Math.max(0, (now - startedAt) / HOUR_MS);
    const cap = Math.max(1, Math.floor(elapsedHours * rate) + 1 + (h % 17));
    const currentAuto = article.viewsAuto || 0;
    if (currentAuto >= cap) continue;

    const tickHash = hashId(`${article._id}:${minute}`);
    const increment = 1 + (tickHash % 2);
    article.viewsAuto = Math.min(cap, currentAuto + increment);
    article.autoViewsTarget = rate;
    article.autoViewsCompleted = false;
    article.views = (article.viewsReal || 0) + article.viewsAuto;
    await article.save();
    updated += 1;
  }

  if (updated > 0) {
    console.log(`[AUTO_VIEWS] ${updated} article(s) incrémentés (rythme décalé)`);
  }
}

module.exports = {
  VIEWS_PER_HOUR,
  HOUR_MS,
  normalizeArticleViews,
  initAutoViewsSchedule,
  tickAutoViewsForArticles,
  rateForArticle,
};
