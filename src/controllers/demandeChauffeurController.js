const DemandeChauffeur = require('../models/DemandeChauffeur');
const User = require('../models/User');
const adminSdk = require('firebase-admin');

// Créer une demande de certification chauffeur
exports.createDemande = async (req, res) => {
  try {
    const userId = req.user && req.user._id ? req.user._id : req.body.user;
    const {
      nom,
      prenom,
      telephone,
      email,
      numeroPermit,
      message,
      permisFile
    } = req.body;
    const demande = new DemandeChauffeur({
      user: userId,
      nom,
      prenom,
      telephone,
      email,
      numeroPermit,
      message,
      permisFile
    });
    await demande.save();
    res.status(201).json({ message: 'Demande de certification créée', demande });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la création de la demande', error });
  }
};

// Lister les demandes (admin ou chauffeur)
exports.getDemandes = async (req, res) => {
  try {
    const { user, statut } = req.query;
    const filter = {};
    if (user) filter.user = user;
    if (statut) filter.statut = statut;
    const demandes = await DemandeChauffeur.find(filter).populate('user', 'nom prenoms email');
    res.json(demandes);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération des demandes', error });
  }
};

// Détail d'une demande
exports.getDemandeById = async (req, res) => {
  try {
    const demande = await DemandeChauffeur.findById(req.params.id).populate('user', 'nom prenoms email');
    if (!demande) return res.status(404).json({ message: 'Demande non trouvée' });
    res.json(demande);
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la récupération de la demande', error });
  }
};

// Changer le statut d'une demande (admin uniquement)
exports.updateStatut = async (req, res) => {
  try {
    const demande = await DemandeChauffeur.findById(req.params.id);
    if (!demande) return res.status(404).json({ message: 'Demande non trouvée' });
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Seul un admin peut changer le statut' });
    }
    demande.statut = req.body.statut;
    await demande.save();
    // Envoi de notification push au chauffeur si fcmToken présent
    const chauffeur = await User.findById(demande.user);
    if (chauffeur && chauffeur.fcmToken) {
      const message = {
        token: chauffeur.fcmToken,
        notification: {
          title: 'Statut de votre demande de certification',
          body: `Votre demande de certification chauffeur a été ${demande.statut}`
        }
      };
      try {
        await adminSdk.messaging().send(message);
      } catch (notifError) {
        console.error('Erreur lors de l\'envoi de la notification FCM :', notifError);
      }
    }
    res.json({ message: 'Statut mis à jour', demande });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour du statut', error });
  }
};

// Supprimer une demande (admin ou chauffeur)
exports.deleteDemande = async (req, res) => {
  try {
    const demande = await DemandeChauffeur.findById(req.params.id);
    if (!demande) return res.status(404).json({ message: 'Demande non trouvée' });
    if (req.user.role !== 'admin' && demande.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Non autorisé à supprimer cette demande' });
    }
    await demande.deleteOne();
    res.json({ message: 'Demande supprimée' });
  } catch (error) {
    res.status(500).json({ message: 'Erreur lors de la suppression', error });
  }
}; 