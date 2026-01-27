const mongoose = require('mongoose');

const userDeviceSchema = new mongoose.Schema(
  {
    userUid: { type: String, required: true, index: true }, // Firebase UID
    deviceId: { type: String, required: true, index: true },
    fcmToken: { type: String, default: null },
    isTrusted: { type: Boolean, default: false, index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userDeviceSchema.index({ userUid: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('UserDevice', userDeviceSchema);

