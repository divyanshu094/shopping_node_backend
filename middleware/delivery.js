module.exports = (req, res, next) => {
  if (!req.user || !req.user.isDeliveryPartner) {
    return res.status(403).json({ message: 'Delivery partner access required' });
  }
  next();
};