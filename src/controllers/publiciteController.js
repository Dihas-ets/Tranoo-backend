const Publicite = require('../models/Publicite');
const User = require('../models/User');
const Article = require('../models/Article');
const adminSdk = require('firebase-admin');

// Créer une demande de pub
exports.createPublicite = async (req, res) => {
  try {
    const vendeurId = req.user && req.user._id ? req.user._id : req.body.vendeur;
    const allowedSources = ['app', 'tranoo'];
    const source =
      typeof req.body.source === 'string' && allowedSources.includes(req.body.source)
        ? req.body.source
        : 'app';

    const publicite = new Publicite({
      ...req.body,
      lien: req.body.lien?.trim() || undefined,
      vendeur: vendeurId,
      source,
    });
    await publicite.save();
    res.status(201).json({ message: 'Demande de pub créée', publicite });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la création de la demande', error });
  }
};

// Lister les demandes de pub (admin ou vendeur via routes privées)
exports.getPublicites = async (req, res) => {
  try {
    const { vendeur, statut, typePub } = req.query;
    const filter = {};
    if (vendeur) filter.vendeur = vendeur;
    if (statut) filter.statut = statut;
    if (typePub) filter.typePub = typePub;
    const publicites = await Publicite.find(filter).populate('vendeur', 'nom prenoms email');
    res.json(publicites);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des demandes', error });
  }
};

// Lister les publicités visibles publiquement (pour apps non authentifiées)
// Ne renvoie que les pubs en statut "valide" (et éventuellement filtrées par typePub)
exports.getPublicitesPublic = async (req, res) => {
  try {
    const { typePub } = req.query;
    const filter = { statut: 'valide' };
    if (typePub) filter.typePub = typePub;
    const publicites = await Publicite.find(filter).populate('vendeur', 'nom prenoms entreprise');
    res.json(publicites);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des publicités publiques', error });
  }
};

// Détail d'une demande
exports.getPubliciteById = async (req, res) => {
  try {
    const publicite = await Publicite.findById(req.params.id).populate('vendeur', 'nom prenoms email');
    if (!publicite) return res.status(404).json({ message: 'Demande non trouvée' });
    res.json(publicite);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération de la demande', error });
  }
};

// Changer le statut d'une demande (admin uniquement)
exports.updateStatut = async (req, res) => {
  try {
    console.log(
      '[PUB_STATUS][UPDATE][IN]',
      JSON.stringify({
        pubId: req.params.id,
        askedStatus: req.body?.statut || null,
        byUserId: req.user?._id ? String(req.user._id) : null,
        byRole: req.user?.role || null,
      })
    );
    const publicite = await Publicite.findById(req.params.id);
    if (!publicite) return res.status(404).json({ message: 'Demande non trouvée' });
    // Autoriser le vendeur à passer à 'payee', mais admin pour les autres statuts
    if (req.body.statut !== 'payee' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un admin peut changer le statut sauf pour "payee".' });
    }
    
    const ancienStatut = publicite.statut;
    publicite.statut = req.body.statut;
    await publicite.save();

    console.log(`[DEBUG] Publicité ${publicite._id} - Statut changé de ${ancienStatut} à ${req.body.statut}`);

    // Si la demande est validée, mettre l'article associé en ligne et démarrer le décompte
    if (req.body.statut === 'valide' && ancienStatut !== 'valide') {
      try {
        const articleObligatoire = publicite.typePub !== 'À la une';
        if (!publicite.articleId && articleObligatoire) {
          return res.status(400).json({
            message: 'Validation impossible: articleId requis pour ce type de publicité',
          });
        }

        // Calculer les dates de début et fin selon la durée
        const maintenant = new Date();
        publicite.dateDebut = maintenant;

        const dureeEnJours = {
          '1 semaine': 7,
          '2 semaines': 14,
          '1 mois': 30,
          '2 mois': 60,
          '3 mois': 90,
        }[publicite.duree] || 7;

        const dateFin = new Date(maintenant);
        dateFin.setDate(dateFin.getDate() + dureeEnJours);
        publicite.dateFin = dateFin;

        console.log(`[DEBUG] Publicité ${publicite._id} - Décompte démarré: ${maintenant} -> ${dateFin} (${dureeEnJours} jours)`);

        if (publicite.articleId) {
          const article = await Article.findById(publicite.articleId);
          if (!article) {
            return res.status(404).json({ message: 'Article lié introuvable' });
          }

          article.statut = 'en_ligne';
          const { initAutoViewsSchedule } = require('../utils/articleViews');
          initAutoViewsSchedule(article, { resetTimer: true });

          if (publicite.typePub === 'Sponsorisée') {
            article.sponsorise = true;
            console.log(`[DEBUG] Article ${article._id} marqué comme sponsorisé`);
          }

          if (publicite.typePub === 'À la une') {
            article.aLaUne = true;
            console.log(`[DEBUG] Article ${article._id} marqué comme à la une`);
          }

          await article.save();
          console.log(`[DEBUG] Article ${article._id} mis à jour - Statut: ${article.statut}, Sponsorisé: ${article.sponsorise}, À la une: ${article.aLaUne}`);
        } else {
          console.log(`[INFO] Publicité ${publicite._id} validée sans article associé (flyer standalone).`);
        }

        await publicite.save();
        console.log(`[DEBUG] Publicité ${publicite._id} sauvegardée avec dateDebut: ${publicite.dateDebut}, dateFin: ${publicite.dateFin}`);
      } catch (articleError) {
        console.error('[ERROR] Erreur lors de la mise en ligne de l\'article:', articleError);
      }
    }

    // Envoi de notification push au vendeur si fcmToken présent
    const vendeur = await User.findById(publicite.vendeur);
    if (vendeur && vendeur.fcmToken) {
      const message = {
        token: vendeur.fcmToken,
        notification: {
          title: 'Statut de votre demande de pub',
          body: `Votre demande de pub (${publicite.typePub}) a été ${publicite.statut}`
        },
        data: {
          type: 'publicite',
          publiciteId: publicite._id.toString(),
          statut: publicite.statut
        }
      };
      try {
        await adminSdk.messaging().send(message);
        console.log(`[DEBUG] Notification FCM envoyée au vendeur ${vendeur._id}`);
      } catch (notifError) {
        console.error('Erreur lors de l\'envoi de la notification FCM :', notifError);
      }
    }

        //
    
    res.json({ 
      message: 'Statut mis à jour', 
      publicite,
      articleUpdated: req.body.statut === 'valide' ? true : false
    });
  } catch (error) {
    console.error('[ERROR] Erreur lors de la mise à jour du statut:', error);
    res.status(500).json({ message: 'Erreur lors de la mise à jour du statut', error });
  }
};

// Supprimer une demande (vendeur ou admin)
exports.deletePublicite = async (req, res) => {
  try {
    const publicite = await Publicite.findById(req.params.id);
    if (!publicite) return res.status(404).json({ message: 'Demande non trouvée' });
    if (req.user.role !== 'admin' && publicite.vendeur.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé à supprimer cette demande' });
    }
    await publicite.deleteOne();
    res.json({ message: 'Demande supprimée' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la suppression', error });
  }
}; 