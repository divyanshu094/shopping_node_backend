const User = require('../models/User');
const Order = require('../models/Order');
const DeliveryAgent = require('../models/DeliveryAgent');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { publishEvent, TOPICS } = require('../config/kafka');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, isDeliveryPartner: true });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id, isDeliveryPartner: true },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status = 'assigned' } = req.query;

    // Find delivery agent
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ message: 'Delivery agent not found' });

    let query = { deliveryAgent: deliveryAgent._id };

    if (status === 'available') {
      // Get orders that are ready for delivery assignment
      query = {
        status: 'processing',
        deliveryAgent: { $exists: false }
      };
    } else {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate(['user', 'items.product'])
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.acceptOrder = async (req, res) => {
  try {
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ message: 'Delivery agent not found' });

    if (!deliveryAgent.isAvailable) {
      return res.status(400).json({ message: 'You are not available for deliveries' });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    if (order.status !== 'processing' || order.deliveryAgent) {
      return res.status(400).json({ message: 'Order not available for assignment' });
    }

    order.deliveryAgent = deliveryAgent._id;
    order.status = 'shipped';
    order.tracking.status = 'Out for delivery';
    await order.save();

    deliveryAgent.isAvailable = false;
    await deliveryAgent.save();

    // Publish delivery tracking event
    await publishEvent(TOPICS.DELIVERY_TRACKING, {
      eventType: 'ORDER_ACCEPTED',
      orderId: order._id,
      deliveryAgentId: deliveryAgent._id,
      status: 'Out for delivery',
      location: deliveryAgent.location
    });

    res.json({ message: 'Order accepted successfully', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markPicked = async (req, res) => {
  try {
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ message: 'Delivery agent not found' });

    const order = await Order.findOne({
      _id: req.params.orderId,
      deliveryAgent: deliveryAgent._id,
      status: 'shipped'
    });

    if (!order) return res.status(404).json({ message: 'Order not found or not assigned to you' });

    order.tracking.status = 'Picked up';
    await order.save();

    // Publish delivery tracking event
    await publishEvent(TOPICS.DELIVERY_TRACKING, {
      eventType: 'ORDER_PICKED_UP',
      orderId: order._id,
      deliveryAgentId: deliveryAgent._id,
      status: 'Picked up',
      location: deliveryAgent.location
    });

    res.json({ message: 'Order marked as picked up', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.markDelivered = async (req, res) => {
  try {
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ message: 'Delivery agent not found' });

    const order = await Order.findOne({
      _id: req.params.orderId,
      deliveryAgent: deliveryAgent._id,
      status: 'shipped'
    });

    if (!order) return res.status(404).json({ message: 'Order not found or not assigned to you' });

    order.status = 'delivered';
    order.tracking.status = 'Delivered';
    order.payment.status = 'completed';
    await order.save();

    // Update delivery agent stats
    deliveryAgent.isAvailable = true;
    deliveryAgent.totalDeliveries += 1;
    deliveryAgent.earnings += 50; // Fixed delivery fee
    await deliveryAgent.save();

    // Publish delivery tracking event
    await publishEvent(TOPICS.DELIVERY_TRACKING, {
      eventType: 'ORDER_DELIVERED',
      orderId: order._id,
      deliveryAgentId: deliveryAgent._id,
      status: 'Delivered',
      location: deliveryAgent.location,
      deliveryTime: new Date()
    });

    // Publish order status update event
    await publishEvent(TOPICS.ORDER_EVENTS, {
      eventType: 'ORDER_DELIVERED',
      orderId: order._id,
      userId: order.user,
      deliveryAgentId: deliveryAgent._id,
      totalEarnings: deliveryAgent.earnings
    });

    res.json({ message: 'Order marked as delivered', order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getEarnings = async (req, res) => {
  try {
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ message: 'Delivery agent not found' });

    // Get earnings for current month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyDeliveries = await Order.countDocuments({
      deliveryAgent: deliveryAgent._id,
      status: 'delivered',
      updatedAt: { $gte: startOfMonth }
    });

    const monthlyEarnings = monthlyDeliveries * 50; // Assuming ₹50 per delivery

    res.json({
      totalEarnings: deliveryAgent.earnings,
      monthlyEarnings,
      totalDeliveries: deliveryAgent.totalDeliveries,
      monthlyDeliveries,
      rating: deliveryAgent.rating
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude } = req.body;

    const deliveryAgent = await DeliveryAgent.findOneAndUpdate(
      { user: req.user.userId },
      {
        currentLocation: { latitude, longitude },
        lastLocationUpdate: new Date()
      },
      { new: true }
    );

    if (!deliveryAgent) return res.status(404).json({ message: 'Delivery agent not found' });

    res.json({ message: 'Location updated successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};