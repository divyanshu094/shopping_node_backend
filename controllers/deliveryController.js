const User = require('../models/User');
const Order = require('../models/Order');
const DeliveryAgent = require('../models/DeliveryAgent');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { publishEvent, TOPICS } = require('../config/kafka');
const { recordPaymentTransaction } = require('../services/paymentLedger');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, isDeliveryPartner: true });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id, isDeliveryPartner: true },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { status = 'assigned' } = req.query;

    // Find delivery agent
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ success: false, message: 'Delivery agent not found' });

    const query = status === 'available'
      ? { status: 'processing', deliveryAgent: { $exists: false } }
      : {
          deliveryAgent: deliveryAgent._id,
          status: status === 'assigned' ? { $in: ['processing', 'shipped'] } : status
        };

    const orders = await Order.find(query)
      .populate(['user', 'items.product'])
      .sort({ createdAt: -1 });

    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.acceptOrder = async (req, res) => {
  try {
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ success: false, message: 'Delivery agent not found' });

    if (!deliveryAgent.isAvailable) {
      return res.status(400).json({ success: false, message: 'You are not available for deliveries' });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (order.status !== 'processing' || order.deliveryAgent) {
      return res.status(400).json({ success: false, message: 'Order not available for assignment' });
    }

    order.deliveryAgent = deliveryAgent._id;
    order.status = 'shipped';
    order.tracking.status = 'Out for delivery';
    order.tracking.estimatedDelivery = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await order.save();

    deliveryAgent.isAvailable = false;
    await deliveryAgent.save();

    // Publish delivery tracking event
    await publishEvent(TOPICS.DELIVERY_TRACKING, {
      eventType: 'ORDER_ACCEPTED',
      orderId: order._id,
      userId: order.user,
      deliveryAgentId: deliveryAgent._id,
      status: 'Out for delivery',
      location: deliveryAgent.currentLocation
    });

    res.json({ success: true, message: 'Order accepted successfully', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markPicked = async (req, res) => {
  try {
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ success: false, message: 'Delivery agent not found' });

    const order = await Order.findOne({
      _id: req.params.orderId,
      deliveryAgent: deliveryAgent._id,
      status: 'shipped'
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found or not assigned to you' });

    order.tracking.status = 'Picked up';
    await order.save();

    // Publish delivery tracking event
    await publishEvent(TOPICS.DELIVERY_TRACKING, {
      eventType: 'ORDER_PICKED_UP',
      orderId: order._id,
      userId: order.user,
      deliveryAgentId: deliveryAgent._id,
      status: 'Picked up',
      location: deliveryAgent.currentLocation
    });

    res.json({ success: true, message: 'Order marked as picked up', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markDelivered = async (req, res) => {
  try {
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ success: false, message: 'Delivery agent not found' });

    const order = await Order.findOne({
      _id: req.params.orderId,
      deliveryAgent: deliveryAgent._id,
      status: 'shipped'
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found or not assigned to you' });

    order.status = 'delivered';
    order.tracking.status = 'Delivered';
    if (order.payment.method === 'cod') {
      order.payment.status = 'completed';
    }
    await order.save();

    if (order.payment.method === 'cod') {
      await recordPaymentTransaction({
        order: order._id,
        user: order.user,
        provider: 'cash',
        status: 'completed',
        amountMinor: Math.round(order.total * 100),
        currency: 'INR',
        method: 'cod',
        gatewayOrderId: `cod:${order._id}`
      });
    }

    // Update delivery agent stats
    deliveryAgent.isAvailable = true;
    deliveryAgent.totalDeliveries += 1;
    deliveryAgent.earnings += 50; // Fixed delivery fee
    await deliveryAgent.save();

    // Publish delivery tracking event
    await publishEvent(TOPICS.DELIVERY_TRACKING, {
      eventType: 'ORDER_DELIVERED',
      orderId: order._id,
      userId: order.user,
      deliveryAgentId: deliveryAgent._id,
      status: 'Delivered',
      location: deliveryAgent.currentLocation,
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

    res.json({ success: true, message: 'Order marked as delivered', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getEarnings = async (req, res) => {
  try {
    const deliveryAgent = await DeliveryAgent.findOne({ user: req.user.userId });
    if (!deliveryAgent) return res.status(404).json({ success: false, message: 'Delivery agent not found' });

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
      success: true,
      totalEarnings: deliveryAgent.earnings,
      monthlyEarnings,
      totalDeliveries: deliveryAgent.totalDeliveries,
      monthlyDeliveries,
      rating: deliveryAgent.rating
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAgentLocation = async (req, res) => {
  try {
    const deliveryAgent = await DeliveryAgent.findById(req.params.agentId)
      .select('currentLocation lastLocationUpdate');
    if (!deliveryAgent) {
      return res.status(404).json({ success: false, message: 'Delivery agent not found' });
    }

    const assignedOrder = await Order.exists({
      user: req.user.userId,
      deliveryAgent: deliveryAgent._id,
      status: { $in: ['shipped', 'delivered'] }
    });
    if (!assignedOrder) {
      return res.status(404).json({ success: false, message: 'Delivery agent not found' });
    }

    res.json({
      success: true,
      agentId: deliveryAgent._id,
      location: deliveryAgent.currentLocation,
      lastUpdated: deliveryAgent.lastLocationUpdate
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getEta = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      user: req.user.userId
    }).select('status tracking.estimatedDelivery tracking.status');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({
      success: true,
      orderId: order._id,
      status: order.status,
      trackingStatus: order.tracking.status,
      estimatedDelivery: order.tracking.estimatedDelivery || null
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ success: false, message: 'Valid latitude and longitude are required' });
    }
    const lastLocationUpdate = new Date();

    const deliveryAgent = await DeliveryAgent.findOneAndUpdate(
      { user: req.user.userId },
      {
        currentLocation: { latitude, longitude },
        lastLocationUpdate
      },
      { new: true, runValidators: true }
    );

    if (!deliveryAgent) return res.status(404).json({ success: false, message: 'Delivery agent not found' });

    const activeOrder = await Order.findOne({
      deliveryAgent: deliveryAgent._id,
      status: 'shipped'
    }).select('_id');
    if (activeOrder && global.socketService) {
      global.socketService.emitDeliveryUpdate(activeOrder._id, {
        location: deliveryAgent.currentLocation,
        deliveryAgentId: deliveryAgent._id
      });
    }

    res.json({
      success: true,
      message: 'Location updated successfully',
      location: deliveryAgent.currentLocation,
      lastUpdated: deliveryAgent.lastLocationUpdate
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};