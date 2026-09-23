const cron = require('node-cron');
const Publicite = require('../models/Publicite');
const Article = require('../models/Article');
const { tickAutoViewsForArticles } = require('./articleViews');
const DelayService = require('../services/layaway/DelayService');

// Tâche qui s'exécute toutes les heures pour vérifier les publicités expirées
const checkExpiredPublicites = cron.schedule('0 * * * *', async () => {
  try {
    console.log('[CRON] Vérification des publicités expirées...');
    
    const maintenant = new Date();
    
    // Trouver toutes les publicités validées et expirées
    const publicitesSpirees = await Publicite.find({
      statut: 'valide',
      dateFin: { $lt: maintenant }
    });
    
    console.log(`[CRON] ${publicitesSpirees.length} publicité(s) expirée(s) trouvée(s)`);
    
    for (const pub of publicitesSpirees) {
      try {
        // Mettre à jour le statut de la publicité
        pub.statut = 'expire';
        await pub.save();
        
        // Désactiver la promotion ET remettre l'article en attente
        if (pub.articleId) {
          const article = await Article.findById(pub.articleId);
          if (article) {
            // Désactiver les promotions
            if (pub.typePub === 'Sponsorisée') {
              article.sponsorise = false;
            }
            if (pub.typePub === 'À la une') {
              article.aLaUne = false;
            }
            
            // Remettre l'article en attente (plus en ligne)
            article.statut = 'en_attente';
            
            await article.save();
            console.log(`[CRON] Article ${article._id} - Promotion ${pub.typePub} désactivée et statut remis en attente`);
          }
        }
        
        console.log(`[CRON] Publicité ${pub._id} expirée et désactivée`);
      } catch (error) {
        console.error(`[CRON] Erreur lors de la désactivation de la publicité ${pub._id}:`, error);
      }
    }
    
  } catch (error) {
    console.error('[CRON] Erreur lors de la vérification des publicités expirées:', error);
  }
}, {
  scheduled: false
});

// Progression des vues automatiques (rythme et ticks décalés par article)
const autoViewsCron = cron.schedule('* * * * *', async () => {
  try {
    await tickAutoViewsForArticles();
  } catch (error) {
    console.error('[CRON][AUTO_VIEWS] Erreur:', error);
  }
}, {
  scheduled: false,
});

// Layaway : retards / gel (quotidien 03:15 UTC)
const layawayDelaysCron = cron.schedule('15 3 * * *', async () => {
  try {
    console.log('[CRON][LAYAWAY] Scan retards / gel...');
    const summary = await DelayService.processDueLayaways(new Date());
    console.log(
      `[CRON][LAYAWAY] scanned=${summary.scanned} updated=${summary.updated} ` +
        `overdue=${summary.markedOverdue} en_retard=${summary.toEnRetard} ` +
        `gele=${summary.toGele} notifs=${summary.notified} errors=${summary.errors.length}`,
    );
  } catch (error) {
    console.error('[CRON][LAYAWAY] Erreur scan retards:', error);
  }
}, {
  scheduled: false,
});

const startCronJobs = () => {
  console.log('[CRON] Démarrage des tâches automatiques...');
  checkExpiredPublicites.start();
  autoViewsCron.start();
  layawayDelaysCron.start();
  tickAutoViewsForArticles().catch((err) => {
    console.error('[CRON][AUTO_VIEWS] Erreur au démarrage:', err);
  });
  console.log('[CRON] Worker vues automatiques démarré (chaque minute)');
  console.log('[CRON] Layaway delays démarré (quotidien 03:15 UTC)');
};

const stopCronJobs = () => {
  console.log('[CRON] Arrêt des tâches automatiques...');
  checkExpiredPublicites.stop();
  autoViewsCron.stop();
  layawayDelaysCron.stop();
};

module.exports = {
  startCronJobs,
  stopCronJobs,
  /** Exposé pour tests / run manuel admin */
  runLayawayDelaysOnce: () => DelayService.processDueLayaways(new Date()),
};
