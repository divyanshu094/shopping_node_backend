const mongoose = require('mongoose');

const paymentTransactionSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['razorpay', 'stripe', 'cash'], required: true },
  type: { type: String, enum: ['payment', 'refund'], default: 'payment', required: true },
  status: {
    type: String,
    enum: ['pending', 'authorized', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
    required: true
  },
  amountMinor: { type: Number, required: true, min: 0 },
  currency: { type: String, required: true, uppercase: true, default: 'INR' },
  method: { type: String },
  gatewayOrderId: { type: String },
  gatewayPaymentId: { type: String },
  gatewayRefundId: { type: String },
  gatewayEventIds: [{ type: String }],
  failureCode: { type: String },
  failureDescription: { type: String },
  initiatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
}, { timestamps: true });

paymentTransactionSchema.index(
  { provider: 1, type: 1, gatewayPaymentId: 1 },
  { unique: true, partialFilterExpression: { gatewayPaymentId: { $type: 'string' } } }
);
paymentTransactionSchema.index(
  { provider: 1, gatewayRefundId: 1 },
  { unique: true, partialFilterExpression: { gatewayRefundId: { $type: 'string' } } }
);
paymentTransactionSchema.index({ user: 1, createdAt: -1 });
paymentTransactionSchema.index({ order: 1, createdAt: -1 });

module.exports = mongoose.model('PaymentTransaction', paymentTransactionSchema);