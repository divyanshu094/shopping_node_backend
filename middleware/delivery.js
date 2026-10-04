const DeliveryAgent = require('../models/DeliveryAgent');

module.exports = async (req, res, next) => {
  if (!req.user || !req.user.isDeliveryPartner) {
    return res.status(403).json({ message: 'Delivery partner access required' });
  }

  try {
    const deliveryAgent = await DeliveryAgent.findOne({
      user: req.user.userId,
      isActive: { $ne: false }
    }).select('_id');
    if (!deliveryAgent) {
      return res.status(403).json({ message: 'This delivery account is inactive' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Unable to verify delivery partner access' });
  }
};