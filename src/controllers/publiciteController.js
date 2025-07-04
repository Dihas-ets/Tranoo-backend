const Publicite = require('../models/Publicite');
const User = require('../models/User');
const adminSdk = require('firebase-admin');

// Créer une demande de pub
exports.createPublicite = async (req, res) => {
  try {
    const vendeurId = req.user && req.user._id ? req.user._id : req.body.vendeur;
    const publicite = new Publicite({ ...req.body, vendeur: vendeurId });
    await publicite.save();
    res.status(201).json({ message: 'Demande de pub créée', publicite });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la création de la demande', error });
  }
};

// Lister les demandes de pub (admin ou vendeur)
exports.getPublicites = async (req, res) => {
  try {
    const { vendeur, statut } = req.query;
    const filter = {};
    if (vendeur) filter.vendeur = vendeur;
    if (statut) filter.statut = statut;
    const publicites = await Publicite.find(filter).populate('vendeur', 'nom prenoms email');
    res.json(publicites);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des demandes', error });
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
    const publicite = await Publicite.findById(req.params.id);
    if (!publicite) return res.status(404).json({ message: 'Demande non trouvée' });
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un admin peut changer le statut' });
    }
    publicite.statut = req.body.statut;
    await publicite.save();
    // Envoi de notification push au vendeur si fcmToken présent
    const vendeur = await User.findById(publicite.vendeur);
    if (vendeur && vendeur.fcmToken) {
      const message = {
        token: vendeur.fcmToken,
        notification: {
          title: 'Statut de votre demande de pub',
          body: `Votre demande de pub (${publicite.typePub}) a été ${publicite.statut}`
        }
      };
      try {
        await adminSdk.messaging().send(message);
      } catch (notifError) {
        console.error('Erreur lors de l\'envoi de la notification FCM :', notifError);
      }
    }
    res.json({ message: 'Statut mis à jour', publicite });
  } catch (error) {
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