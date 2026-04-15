const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
  plan: { type: String, enum: ['monthly'], default: 'monthly' },
  months: { type: Number, default: 1, min: 1, max: 24 },
  activatedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ['active', 'expired'], default: 'active' },
}, { timestamps: true });

subscriptionSchema.methods.isActive = function () {
  return this.expiresAt && this.expiresAt > new Date();
};

module.exports = mongoose.model('Subscription', subscriptionSchema);




