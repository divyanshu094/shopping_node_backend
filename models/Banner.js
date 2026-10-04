const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  image: { type: String, required: true },
  link: { type: String },
  type: { type: String, enum: ['product', 'category', 'external'], default: 'external' },
  targetId: { type: mongoose.Schema.Types.ObjectId }, // product or category ID
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  startDate: { type: Date },
  endDate: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Banner', bannerSchema);