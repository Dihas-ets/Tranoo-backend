const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    ok: { type: Boolean, required: true },
    reason: { type: String, default: null },
  },
  { _id: false }
);

const passwordResetRequestSchema = new mongoose.Schema(
  {
    userUid: { type: String, required: true, index: true }, // Firebase UID
    deviceId: { type: String, required: true, index: true },
    fcmToken: { type: String, required: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: true },
    attempts: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['pending', 'verified', 'used', 'expired', 'locked'],
      default: 'pending',
      index: true,
    },
    verifiedAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    audit: {
      attempts: { type: [attemptSchema], default: [] },
      requestedAt: { type: Date, default: Date.now },
    },
  },
  { timestamps: true }
);

passwordResetRequestSchema.index({ userUid: 1, deviceId: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model('PasswordResetRequest', passwordResetRequestSchema);

