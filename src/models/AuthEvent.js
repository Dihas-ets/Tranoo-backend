const mongoose = require('mongoose');

const authEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    uid: { type: String, required: true, index: true },
    role: { type: String, default: null, index: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // agentCommercial lié (si vendeur Tranoo_pro)
    eventType: { type: String, enum: ['login', 'logout'], required: true, index: true },
    deviceId: { type: String, default: null, index: true },
    client: { type: String, default: null }, // ex: "mobile"
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

authEventSchema.index({ uid: 1, eventType: 1, deviceId: 1, createdAt: -1 });
authEventSchema.index({ agent: 1, eventType: 1, createdAt: -1 });

module.exports = mongoose.model('AuthEvent', authEventSchema);

