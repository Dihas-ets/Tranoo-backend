const Referral = require('../models/Referral');
const ReferralTariff = require('../models/ReferralTariff');
const User = require('../models/User');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');
const AgentEarning = require('../models/AgentEarning');
const crypto = require('crypto');

exports.getMyDashboard = async (req, res) => {
  try {
    const user = req.user;
    if (user.role !== 'agentCommercial') {
      return res.status(403).json({ message: 'Accès réservé aux agents commerciaux' });
    }

    const referrerId = user._id;

    const totalReferrals = await Referral.countDocuments({ referrerId });
    const completed = await Referral.find({ referrerId, status: 'completed' }).select('rewardAmount');
    const completedCount = completed.length;

    // Somme des gains enregistrés (incluant 150 FCFA par inscription et 10% commissions)
    const earnings = await AgentEarning.aggregate([
      { $match: { agent: user._id } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEarnings = (earnings[0]?.total || 0);

    const tariffs = await ReferralTariff.find({}).sort({ createdAt: -1 });

    res.json({
      agent: {
        id: user._id,
        uid: user.uid,
        nom: user.nom,
        prenoms: user.prenoms,
        email: user.email,
        photo: user.photo || null,
        role: user.role,
        assignedReferralTariff: user.assignedReferralTariff || null,
        referralCode: user.referralCode || null,
      },
      stats: {
        totalReferrals,
        completedReferrals: completedCount,
        pendingReferrals: totalReferrals - completedCount,
        totalEarnings,
      },
      tariffs,
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur chargement tableau de bord agent', error: err.message });
  }
};

// Création d'un agent commercial par un administrateur
exports.createAgent = async (req, res) => {
  try {
    const adminUser = req.user;
    if (adminUser.role !== 'admin') {
      return res.status(403).json({ message: 'Accès refusé. Admin requis.' });
    }

    const { nom, prenoms, email, telephone, password, assignedReferralTariff } = req.body;
    if (!email || !password || !nom || !prenoms) {
      return res.status(400).json({ message: 'Champs requis: nom, prenoms, email, password' });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Un utilisateur avec cet email existe déjà' });

    const fbUser = await admin.auth().createUser({
      email,
      password,
      displayName: `${prenoms} ${nom}`,
    });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({
      uid: fbUser.uid,
      nom,
      prenoms,
      email,
      telephone,
      role: 'agentCommercial',
      password: hashed,
      assignedReferralTariff: assignedReferralTariff || null,
      statut: 'actif',
      dateInscription: new Date(),
    });

    // Générer un code de parrainage unique
    const generateReferralCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();
    let code = generateReferralCode();
    while (await User.findOne({ referralCode: code })) {
      code = generateReferralCode();
    }
    user.referralCode = code;
    await user.save();

    return res.status(201).json({ message: 'Agent commercial créé avec succès', user });
  } catch (err) {
    return res.status(500).json({ message: "Erreur lors de la création de l'agent commercial", error: err.message });
  }
};

// Leaderboard dynamique des agents (par nombre de parrainages validés)
exports.getLeaderboard = async (req, res) => {
  try {
    const me = req.user;
    // Agrégation des parrainages complétés par agent
    const rows = await Referral.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: '$referrerId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $match: { 'user.role': 'agentCommercial' } },
      { $project: { agentId: '$user._id', nom: '$user.nom', prenoms: '$user.prenoms', count: 1 } }
    ]);

    // Trouver la position de l'agent courant
    const sorted = rows; // déjà trié desc
    const myRow = sorted.find(r => String(r.agentId) === String(me._id));
    const myCount = myRow ? myRow.count : 0;
    const myRank = myRow ? (sorted.findIndex(r => String(r.agentId) === String(me._id)) + 1) : (sorted.length + 1);

    // Construire top 5 anonymisé (sauf "Vous")
    const top = sorted.slice(0, 5).map(r => {
      const isSelf = String(r.agentId) === String(me._id);
      const anonym = `Agent #${String(r.agentId).slice(-4).toUpperCase()}`;
      return {
        name: isSelf ? 'Vous' : anonym,
        count: r.count,
        self: isSelf
      };
    });

    return res.json({ top, myRank, myCount });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur leaderboard', error: err.message });
  }
};


