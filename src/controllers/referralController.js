const Referral = require('../models/Referral');
const ReferralSettings = require('../models/ReferralSettings');
const ReferralTariff = require('../models/ReferralTariff');
const User = require('../models/User');
const crypto = require('crypto');
const AgentEarning = require('../models/AgentEarning');

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

class ReferralCreationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function formatMonthFromDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getCurrentMonthString() {
  return formatMonthFromDate(new Date());
}

function getMonthRange(monthString) {
  if (!MONTH_PATTERN.test(monthString)) {
    throw new Error('Format de mois invalide. Utilisez YYYY-MM.');
  }
  const [year, month] = monthString.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 1));
  return { startDate, endDate };
}

// Générer un code de parrainage unique
const generateReferralCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();

async function ensureSettings() {
  let settings = await ReferralSettings.findOne();
  if (!settings) {
    settings = new ReferralSettings();
    await settings.save();
  }
  return settings;
}

async function resolveRewardAmountForReferrer(referrer) {
  if (referrer.assignedReferralTariff) {
    try {
      const tariff = await ReferralTariff.findById(referrer.assignedReferralTariff);
      if (tariff && tariff.isActive) {
        return tariff.amount;
      }
    } catch (error) {
      console.error('Erreur récupération tarif parrainage:', error.message);
    }
  }
  const settings = await ensureSettings();
  return settings.rewardAmount;
}

async function createReferralRecord({ referralCode, referredUser }) {
  if (!referralCode) {
    throw new ReferralCreationError('Code de parrainage requis', 400);
  }
  if (!referredUser?._id) {
    throw new ReferralCreationError('Utilisateur parrainé invalide', 400);
  }

  const referrer = await User.findOne({ referralCode });
  if (!referrer) {
    throw new ReferralCreationError('Code de parrainage invalide', 400);
  }

  if (referrer._id.equals(referredUser._id)) {
    throw new ReferralCreationError('Vous ne pouvez pas vous parrainer vous-même', 400);
  }

  const alreadyReferred = await Referral.findOne({ referredId: referredUser._id });
  if (alreadyReferred) {
    throw new ReferralCreationError('Cet utilisateur a déjà été parrainé', 400);
  }

  const isAgent = referrer.role === 'agentCommercial';
  let rewardAmount = 0;

  if (isAgent) {
    rewardAmount = 150;
  } else {
    rewardAmount = await resolveRewardAmountForReferrer(referrer);
  }

  const referral = new Referral({
    referrerId: referrer._id,
    referredId: referredUser._id,
    referralCode,
    status: isAgent ? 'completed' : 'pending',
    rewardAmount,
  });

  await referral.save();

  await updateReferrerStats(referrer._id, referredUser._id);

  if (isAgent) {
    try {
      await AgentEarning.create({
        agent: referrer._id,
        type: 'referral_signup',
        amount: 150,
        sourceReferral: referral._id,
        referredUser: referredUser._id,
      });
    } catch (error) {
      console.error('Erreur création gain agent:', error.message);
    }
  }

  return {
    referral,
    referrer,
    rewardAmount,
    status: referral.status,
    isAgent,
  };
}

exports.createReferralRecord = createReferralRecord;
exports.ReferralCreationError = ReferralCreationError;

async function updateReferrerStats(referrerId, referredUserId) {
  try {
    await User.findByIdAndUpdate(
      referrerId,
      {
        $inc: { 'referralStats.totalReferred': 1 },
        $addToSet: { 'referralStats.referredUserIds': referredUserId },
      },
      { new: false }
    );
  } catch (error) {
    console.error('Erreur mise à jour statistiques parrainage:', error.message);
  }
}

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
    const referralStats = user.referralStats || { totalReferred: 0, referredUserIds: [] };
    
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
      pendingReferrals: totalReferrals - completedReferrals,
      referralStats: {
        totalTrackedReferrals: referralStats.totalReferred,
        referredUserIds: referralStats.referredUserIds
      }
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

// Obtenir les statistiques mensuelles d'un utilisateur
exports.getMonthlyReferralStats = async (req, res) => {
  try {
    const userId = req.user.uid;
    const user = await User.findOne({ uid: userId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const requestedMonth = req.query.month || getCurrentMonthString();
    let range;
    try {
      range = getMonthRange(requestedMonth);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const totalReferrals = await Referral.countDocuments({
      referrerId: user._id,
      createdAt: { $gte: range.startDate, $lt: range.endDate },
    });

    const monthlyBreakdown = await Referral.aggregate([
      { $match: { referrerId: user._id } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const timeline = monthlyBreakdown.map((item) => ({
      month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
      count: item.count,
    }));

    const fallbackDate = user.dateInscription || new Date();
    const earliestMonth = timeline[0]?.month || formatMonthFromDate(fallbackDate);

    return res.status(200).json({
      selectedMonth: requestedMonth,
      totalReferrals,
      timeline,
      earliestMonth,
    });
  } catch (error) {
    console.error('Error fetching monthly referral stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Enregistrer un nouveau parrainage
exports.createReferral = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const referredUserId = req.user.uid;
    const referredUser = await User.findOne({ uid: referredUserId });
    if (!referredUser) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    
    const { referral, isAgent } = await createReferralRecord({
      referralCode,
      referredUser,
    });

    return res.status(201).json({
      message: isAgent
        ? 'Parrainage validé et prime agent créditée'
        : 'Parrainage enregistré avec succès',
      referral,
    });
  } catch (error) {
    if (error instanceof ReferralCreationError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('Error creating referral:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
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
