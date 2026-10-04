const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['order', 'promotion', 'system', 'delivery'], default: 'system' },
  isRead: { type: Boolean, default: false },
  data: { type: mongoose.Schema.Types.Mixed }, // additional data like orderId, etc.
  sentAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);