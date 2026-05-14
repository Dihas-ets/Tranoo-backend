const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const Payment = require('../src/models/Payment');
const User = require('../src/models/User');
const Referral = require('../src/models/Referral');
const AgentEarning = require('../src/models/AgentEarning');
const ReferralSettings = require('../src/models/ReferralSettings');

function isObjectIdLike(value) {
  return typeof value === 'string' && mongoose.Types.ObjectId.isValid(value);
}

async function getCommissionRate() {
  const settings = await ReferralSettings.findOne().lean();
  return Number.isFinite(settings?.agentCommissionRate)
    ? settings.agentCommissionRate
    : 10;
}

async function resolveReferredUserId(rawUser) {
  const value = rawUser && typeof rawUser === 'object' ? rawUser._id : rawUser;
  if (!value) return null;
  if (isObjectIdLike(String(value))) return value;

  const user = await User.findOne({ uid: String(value) }).select('_id').lean();
  return user?._id || null;
}

async function backfill() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI ou MONGO_URI manquant');
  }

  await mongoose.connect(mongoUri);

  const commissionRate = await getCommissionRate();
  const payments = await Payment.find({
    status: 'success',
    type: { $in: ['publicite', 'subscription'] },
  }).lean();

  let created = 0;
  let skippedExisting = 0;
  let skippedNoReferral = 0;
  let skippedNoUser = 0;
  let skippedInvalidAmount = 0;

  for (const payment of payments) {
    const alreadyPaid = await AgentEarning.exists({ sourcePayment: payment._id });
    if (alreadyPaid) {
      skippedExisting += 1;
      continue;
    }

    const referredUserId = await resolveReferredUserId(payment.user);
    if (!referredUserId) {
      skippedNoUser += 1;
      continue;
    }

    const referral = await Referral.findOne({
      referredId: referredUserId,
      status: { $in: ['completed', 'pending'] },
    })
      .sort({ createdAt: -1 })
      .populate('referrerId');

    if (!referral || referral.referrerId?.role !== 'agentCommercial') {
      skippedNoReferral += 1;
      continue;
    }

    const commission = Math.round((Number(payment.amount) || 0) * (commissionRate / 100));
    if (commission <= 0) {
      skippedInvalidAmount += 1;
      continue;
    }

    await AgentEarning.create({
      agent: referral.referrerId._id,
      type: payment.type === 'subscription' ? 'commission_subscription' : 'commission_publicite',
      amount: commission,
      sourcePayment: payment._id,
      referredUser: referredUserId,
    });

    if (referral.status !== 'completed') {
      referral.status = 'completed';
      referral.completedAt = new Date();
      await referral.save();
    }

    created += 1;
    console.log(
      `[BACKFILL_AGENT_COMMISSION] created payment=${payment._id} agent=${referral.referrerId._id} amount=${commission}`
    );
  }

  console.log(
    JSON.stringify(
      {
        scanned: payments.length,
        created,
        skippedExisting,
        skippedNoReferral,
        skippedNoUser,
        skippedInvalidAmount,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

backfill().catch(async (error) => {
  console.error('[BACKFILL_AGENT_COMMISSION][ERROR]', error);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
