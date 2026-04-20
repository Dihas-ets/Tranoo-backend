const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
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

const invoiceSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invoiceNumber: { type: String, required: true, unique: true },
  items: [invoiceItemSchema],
  subtotal: { type: Number, required: true },
  deliveryFee: { type: Number, required: true, default: 0 },
  discount: { type: Number, required: true, default: 0 },
  tax: { type: Number, required: true, default: 0 },
  total: { type: Number, required: true },
  
  // Informations de paiement
  paymentMethod: { 
    type: String, 
    required: true, 
    enum: ['cash', 'online', 'mobile_money', 'credit_card', 'paypal', 'especes']
  },
  paymentStatus: { 
    type: String, 
    required: true, 
    enum: ['pending', 'paid', 'failed', 'refunded', 'en_attente', 'payée', 'remboursée'],
    default: 'pending'
  },
  paymentId: { type: String },
  paymentDate: { type: Date },
  
  // Informations de livraison
  deliveryAddress: { type: String, required: true },
  deliveryStatus: { 
    type: String, 
    enum: ['pending', 'processing', 'shipped', 'delivered'],
    default: 'pending'
  },
  trackingNumber: { type: String },
  estimatedDelivery: { type: Date },
  actualDelivery: { type: Date },
  
  // Informations sur l'entreprise/fournisseur
  company: { type: String, required: true },
  companyAddress: { type: String },
  companyPhone: { type: String },
  companyEmail: { type: String },
  sellerName: { type: String, default: null },
  shopName: { type: String, default: null },
  
  // Références
  reference: { type: String, required: true },
  
  // Statut
  status: { 
    type: String, 
    required: true, 
    enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
    default: 'sent'
  },
  
  // Dates
  issueDate: { type: Date, required: true, default: Date.now },
  dueDate: { type: Date },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index pour les requêtes fréquentes
invoiceSchema.index({ userId: 1, createdAt: -1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ orderId: 1 });
invoiceSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
