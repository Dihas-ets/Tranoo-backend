const cron = require('node-cron');
const Publicite = require('../models/Publicite');
const Article = require('../models/Article');

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

const startCronJobs = () => {
  console.log('[CRON] Démarrage des tâches automatiques...');
  checkExpiredPublicites.start();
};

const stopCronJobs = () => {
  console.log('[CRON] Arrêt des tâches automatiques...');
  checkExpiredPublicites.stop();
};

module.exports = {
  startCronJobs,
  stopCronJobs
};