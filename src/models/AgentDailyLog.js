const mongoose = require('mongoose');

const AgentDailyLogSchema = new mongoose.Schema(
  {
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    dateKey: { type: String, required: true, index: true }, // YYYY-MM-DD
    zoneText: { type: String, default: '' },
    zoneLocation: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      label: { type: String, default: '' },
      capturedAt: { type: Date, default: null },
    },
    prospectsApproached: { type: Number, default: 0, min: 0 },
    adminObservation: { type: String, default: '' },
    adminObservationUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminObservationUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

AgentDailyLogSchema.index({ agent: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('AgentDailyLog', AgentDailyLogSchema);
