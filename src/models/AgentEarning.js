const mongoose = require('mongoose');

const AgentEarningSchema = new mongoose.Schema({
  agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { 
    type: String, 
    enum: [
      'referral_signup',
      'commission_publicite',
      'commission_subscription',
      'daily_presence',
      'withdrawal',
    ], 
    required: true 
  },
  amount: { type: Number, required: true }, // en XOF
  currency: { type: String, default: 'XOF' },
  sourceReferral: { type: mongoose.Schema.Types.ObjectId, ref: 'Referral', default: null },
  sourcePayment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
  referredUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
});

AgentEarningSchema.index(
  { sourcePayment: 1 },
  {
    unique: true,
    partialFilterExpression: { sourcePayment: { $type: 'objectId' } },
  }
);

module.exports = mongoose.model('AgentEarning', AgentEarningSchema);


