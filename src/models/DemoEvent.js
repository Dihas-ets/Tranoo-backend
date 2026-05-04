const mongoose = require('mongoose');

const demoEventSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // vendeur
    uid: { type: String, required: true, index: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // agentCommercial lié
    sessionKey: { type: String, required: true, index: true }, // uid:auth_time
    eventType: {
      type: String,
      enum: [
        'subscription_initiated',
        'campaign_initiated',
        'seller_create_started',
        'seller_create_completed',
        'listing_opened_une',
        'listing_opened_piece',
      ],
      required: true,
      index: true,
    },
    page: { type: String, default: null },
    deviceId: { type: String, default: null, index: true },
    meta: { type: Object, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
  },
  { timestamps: true }
);

demoEventSchema.index({ agent: 1, eventType: 1, createdAt: -1 });
demoEventSchema.index({ agent: 1, sessionKey: 1, createdAt: -1 });
demoEventSchema.index({ sessionKey: 1, eventType: 1, createdAt: -1 });

module.exports = mongoose.model('DemoEvent', demoEventSchema);

