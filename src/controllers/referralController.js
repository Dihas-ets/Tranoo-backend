const Referral = require('../models/Referral');
const ReferralSettings = require('../models/ReferralSettings');
const User = require('../models/User');
const crypto = require('crypto');
const AgentEarning = require('../models/AgentEarning');

// Générer un code de parrainage unique
const generateReferralCode = () => {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Obtenir les statistiques de parrainage d'un utilisateur
exports.getUserReferralStats = async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // Trouver l'utilisateur dans MongoDB pour obtenir son _id
    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    
    const totalReferrals = await Referral.countDocuments({ referrerId: user._id });
    const completedReferrals = await Referral.countDocuments({ 
      referrerId: user._id, 
      status: 'completed' 
    });
    
    // Obtenir le code de parrainage de l'utilisateur
    const referralCode = user.referralCode || generateReferralCode();
    
    // Si l'utilisateur n'a pas de code, lui en créer un
    if (!user.referralCode) {
      await User.findOneAndUpdate(
        { uid: userId },
        { referralCode: referralCode }
      );
    }
    
    res.status(200).json({
      totalReferrals,
      completedReferrals,
      referralCode,
      pendingReferrals: totalReferrals - completedReferrals
    });
  } catch (error) {
    console.error('Error fetching referral stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Obtenir la liste des parrainages d'un utilisateur
exports.getUserReferrals = async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // Trouver l'utilisateur dans MongoDB pour obtenir son _id
    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    
    const referrals = await Referral.find({ referrerId: user._id })
      .populate('referredId', 'nom prenoms email createdAt')
      .sort({ createdAt: -1 });
    
    res.status(200).json(referrals);
  } catch (error) {
    console.error('Error fetching user referrals:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Enregistrer un nouveau parrainage
exports.createReferral = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const referredUserId = req.user.uid;
    
    // Vérifier que l'utilisateur n'a pas déjà été parrainé
    const referredUser = await User.findOne({ uid: referredUserId });
    if (!referredUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    
    const existingReferral = await Referral.findOne({ referredId: referredUser._id });
    if (existingReferral) {
      return res.status(400).json({ message: 'Cet utilisateur a déjà été parrainé' });
    }
    
    // Trouver l'utilisateur parrain
    const referrer = await User.findOne({ referralCode: referralCode });
    if (!referrer) {
      return res.status(400).json({ message: 'Code de parrainage invalide' });
    }
    
    // Vérifier qu'on ne peut pas se parrainer soi-même
    if (referrer.uid === referredUserId) {
      return res.status(400).json({ message: 'Vous ne pouvez pas vous parrainer vous-même' });
    }
    
    // Déterminer le montant de récompense à utiliser
    // Priorité: Tarif assigné au parrain (agent commercial) s'il existe, sinon paramètres globaux
    let rewardAmountToUse = 0;
    if (referrer.assignedReferralTariff) {
      const ReferralTariff = require('../models/ReferralTariff');
      try {
        const tariff = await ReferralTariff.findById(referrer.assignedReferralTariff);
        if (tariff && tariff.isActive) {
          rewardAmountToUse = tariff.amount;
        }
      } catch (_) {
        // ignore and fallback to settings
      }
    }
    if (!rewardAmountToUse) {
      let settings = await ReferralSettings.findOne();
      if (!settings) {
        settings = new ReferralSettings();
        await settings.save();
      }
      rewardAmountToUse = settings.rewardAmount;
    }
    
    // Créer le parrainage
    const referral = new Referral({
      referrerId: referrer._id,
      referredId: referredUser._id,
      referralCode: referralCode,
      status: referrer.role === 'agentCommercial' ? 'completed' : 'pending',
      rewardAmount: referrer.role === 'agentCommercial' ? 150 : rewardAmountToUse
    });
    
    await referral.save();

    // Créer le gain de 150 FCFA pour l'agent si applicable
    if (referrer.role === 'agentCommercial') {
      try {
        await AgentEarning.create({
          agent: referrer._id,
          type: 'referral_signup',
          amount: 150,
          sourceReferral: referral._id,
          referredUser: referredUser._id,
        });
      } catch (e) {
        console.error('Erreur création gain agent:', e.message);
      }
    }
    
    res.status(201).json({ 
      message: referrer.role === 'agentCommercial' ? 'Parrainage validé et prime agent créditée' : 'Parrainage enregistré avec succès', 
      referral 
    });
  } catch (error) {
    console.error('Error creating referral:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Marquer un parrainage comme complété
exports.completeReferral = async (req, res) => {
  try {
    const { referralId } = req.params;
    
    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ message: 'Parrainage non trouvé' });
    }
    
    if (referral.status === 'completed') {
      return res.status(400).json({ message: 'Ce parrainage est déjà complété' });
    }
    
    referral.status = 'completed';
    referral.completedAt = new Date();
    await referral.save();
    
    res.status(200).json({ 
      message: 'Parrainage marqué comme complété', 
      referral 
    });
  } catch (error) {
    console.error('Error completing referral:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Obtenir tous les parrainages (pour l'admin)
exports.getAllReferrals = async (_req, res) => {
  try {
    const referrals = await Referral.find()
      .populate('referrerId', 'nom prenoms email')
      .populate('referredId', 'nom prenoms email')
      .sort({ createdAt: -1 });
    
    res.status(200).json(referrals);
  } catch (error) {
    console.error('Error fetching all referrals:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Obtenir les paramètres de parrainage
exports.getReferralSettings = async (_req, res) => {
  try {
    let settings = await ReferralSettings.findOne();
    if (!settings) {
      settings = new ReferralSettings();
      await settings.save();
    }
    
    res.status(200).json(settings);
  } catch (error) {
    console.error('Error fetching referral settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Mettre à jour les paramètres de parrainage
exports.updateReferralSettings = async (req, res) => {
  try {
    const { isActive, rewardAmount, minReferrals, maxReferrals, description, terms } = req.body;
    
    let settings = await ReferralSettings.findOne();
    if (!settings) {
      settings = new ReferralSettings();
    }
    
    settings.isActive = isActive;
    settings.rewardAmount = rewardAmount;
    settings.minReferrals = minReferrals;
    settings.maxReferrals = maxReferrals;
    settings.description = description;
    settings.terms = terms;
    settings.updatedAt = new Date();
    
    await settings.save();
    
    res.status(200).json({ 
      message: 'Paramètres de parrainage mis à jour', 
      settings 
    });
  } catch (error) {
    console.error('Error updating referral settings:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
