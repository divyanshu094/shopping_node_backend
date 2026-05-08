const mongoose = require('mongoose');

const deliveryAgentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vehicleType: { type: String, enum: ['bike', 'car', 'truck'], default: 'bike' },
  vehicleNumber: { type: String },
  licenseNumber: { type: String },
  isAvailable: { type: Boolean, default: true },
  currentLocation: {
    latitude: { type: Number },
    longitude: { type: Number }
  },
  rating: { type: Number, default: 0 },
  totalDeliveries: { type: Number, default: 0 },
  earnings: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('DeliveryAgent', deliveryAgentSchema);