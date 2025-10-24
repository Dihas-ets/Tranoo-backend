const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  articleId: { type: String, required: true },
  title: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  imageUrl: { type: String },
  pieceType: { type: String },
  model: { type: String },
  fuelType: { type: String },
});

const orderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, required: true, default: 0 },
  discount: { type: Number, required: true, default: 0 },
  total: { type: Number, required: true },
  paymentMethod: { 
    type: String, 
    required: true, 
    enum: ['cash', 'online'] 
  },
  status: { 
    type: String, 
    required: true, 
    enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'pending'
  },
  deliveryAddress: { type: String, required: true },
  deliveryNote: { type: String },
  trackingNumber: { type: String },
  estimatedDelivery: { type: Date },
  actualDelivery: { type: Date },
  paymentId: { type: String }, // Pour les paiements en ligne
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index pour les requêtes fréquentes
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);
