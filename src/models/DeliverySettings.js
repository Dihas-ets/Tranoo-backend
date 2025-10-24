const mongoose = require('mongoose');

const deliverySettingsSchema = new mongoose.Schema({
  deliveryFee: { type: Number, required: true, default: 720 },
  discount: { type: Number, required: true, default: 500 },
  freeDeliveryThreshold: { type: Number, required: true, default: 50000 },
  enableDiscounts: { type: Boolean, required: true, default: true },
  enableFreeDelivery: { type: Boolean, required: true, default: true },
  estimatedDeliveryDays: { type: Number, required: true, default: 5 },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now }
});

// S'assurer qu'il n'y a qu'un seul document de paramètres
deliverySettingsSchema.index({}, { unique: true });

module.exports = mongoose.model('DeliverySettings', deliverySettingsSchema);
