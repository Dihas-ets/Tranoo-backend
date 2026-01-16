const User = require('../models/User');

// Récupérer les paramètres de l'utilisateur
exports.getSettings = async (req, res) => {
  try {
    const userId = req.user.uid;
    const user = await User.findOne({ uid: userId });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    res.json({
      language: user.langue || 'fr',
      currency: user.devise || 'XOF',
      notificationsEnabled: true, // À implémenter si vous ajoutez ce champ au modèle
      locationTrackingEnabled: true, // À implémenter si vous ajoutez ce champ au modèle
    });
  } catch (error) {
    console.error('Erreur récupération paramètres:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Mettre à jour les paramètres de l'utilisateur
exports.updateSettings = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { language, currency, notificationsEnabled, locationTrackingEnabled } = req.body;

    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (language) user.langue = language;
    if (currency) user.devise = currency;
    // Ajouter d'autres champs si nécessaire

    await user.save();

    res.json({
      success: true,
      message: 'Paramètres mis à jour avec succès',
      settings: {
        language: user.langue,
        currency: user.devise,
      },
    });
  } catch (error) {
    console.error('Erreur mise à jour paramètres:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Mettre à jour la langue
exports.updateLanguage = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { language } = req.body;

    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    user.langue = language || 'fr';
    await user.save();

    res.json({
      success: true,
      message: 'Langue mise à jour',
      language: user.langue,
    });
  } catch (error) {
    console.error('Erreur mise à jour langue:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Mettre à jour la devise
exports.updateCurrency = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { currency } = req.body;

    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    user.devise = currency || 'XOF';
    await user.save();

    res.json({
      success: true,
      message: 'Devise mise à jour',
      currency: user.devise,
    });
  } catch (error) {
    console.error('Erreur mise à jour devise:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

// Mettre à jour les préférences de notification
exports.updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { enabled } = req.body;

    // TODO: Implémenter la logique pour activer/désactiver les notifications
    // Cela peut nécessiter d'ajouter un champ au modèle User ou une collection séparée

    res.json({
      success: true,
      message: 'Préférences de notification mises à jour',
      notificationsEnabled: enabled,
    });
  } catch (error) {
    console.error('Erreur mise à jour notifications:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

