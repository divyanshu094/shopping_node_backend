const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const DeliveryAgent = require('../models/DeliveryAgent');
const { v4: uuidv4 } = require('uuid');
const { publishEvent, TOPICS } = require('../config/kafka');
const { recordPaymentTransaction } = require('../services/paymentLedger');
const mongoose = require('mongoose');

const restoreInventory = async (items) => {
  for (const item of items) {
    await Product.updateOne(
      { _id: item.product },
      { $inc: { stock: item.quantity, soldCount: -item.quantity } }
    );
  }
};

const reserveInventory = async (items) => {
  const quantities = new Map();
  for (const item of items) {
    const productId = item.product.toString();
    quantities.set(productId, (quantities.get(productId) || 0) + item.quantity);
  }

  const reserved = [];
  try {
    for (const [productId, quantity] of quantities) {
      const result = await Product.updateOne(
        { _id: productId, isActive: { $ne: false }, stock: { $gte: quantity } },
        { $inc: { stock: -quantity, soldCount: quantity } }
      );
      if (result.modifiedCount !== 1) {
        const product = await Product.findById(productId);
        const productName = product?.name || product?.title || productId;
        const error = new Error(product ? `Insufficient stock for ${productName}` : 'Product not found');
        error.statusCode = product ? 409 : 404;
        throw error;
      }
      reserved.push({ product: productId, quantity });
    }
  } catch (error) {
    await restoreInventory(reserved);
    throw error;
  }

  return reserved;
};

// exports.createOrder = async (req, res) => {
//   try {
//     const cart = await Cart.findOne({ user: req.user.userId }).populate('items.product coupon');
//     if (!cart || cart.items.length === 0) {
//       return res.status(400).json({ success: false, message: 'Cart is empty' });
//     }

//     const { shippingAddress, paymentMethod } = req.body;
//     if (!shippingAddress || !paymentMethod) {
//       return res.status(400).json({ success: false, message: 'Shipping address and payment method are required' });
//     }

//     // Check stock availability
//     for (const item of cart.items) {
//       if (item.product.stock < item.quantity) {
//         return res.status(400).json({
//           success: false,
//           message: `Insufficient stock for ${item.product.name}`
//         });
//       }
//     }

//     // Calculate totals
//     let subtotal = 0;
//     const orderItems = cart.items.map(item => {
//       const price = item.product.price;
//       subtotal += price * item.quantity;
//       return {
//         product: item.product._id,
//         quantity: item.quantity,
//         price,
//         attributes: item.attributes
//       };
//     });

//     const tax = subtotal * 0.18; // 18% GST
//     let discount = cart.discount || 0;
//     const total = subtotal + tax - discount;

//     const order = new Order({
//       user: req.user.userId,
//       items: orderItems,
//       total,
//       subtotal,
//       tax,
//       discount: discount,
//       coupon: cart.coupon,
//       shippingAddress,
//       payment: {
//         method: paymentMethod,
//         amount: total
//       }
//     });

//     // Generate tracking number
//     order.tracking.trackingNumber = `ORD-${uuidv4().substring(0, 8).toUpperCase()}`;

//     await order.save();

//     // Publish order created event
//     await publishEvent(TOPICS.ORDER_EVENTS, {
//       eventType: 'ORDER_CREATED',
//       orderId: order._id,
//       userId: req.user.userId,
//       total: order.total,
//       items: order.items.length,
//       paymentMethod: paymentMethod
//     });

//     // Update product stock and publish inventory updates
//     for (const item of cart.items) {
//       await Product.findByIdAndUpdate(item.product._id, {
//         $inc: { stock: -item.quantity, soldCount: item.quantity }
//       });

//       // Publish inventory update event
//       await publishEvent(TOPICS.INVENTORY_UPDATES, {
//         eventType: 'STOCK_DECREASED',
//         productId: item.product._id,
//         quantity: item.quantity,
//         reason: 'ORDER_PLACED',
//         orderId: order._id
//       });
//     }

//     // Clear cart
//     cart.items = [];
//     cart.coupon = null;
//     cart.discount = 0;
//     await cart.save();

//     await order.populate(['items.product', 'coupon']);
//     res.status(201).json({ success: true, order });
//   } catch (err) {
//     res.status(500).json({ success: false, message: err.message });
//   }
// };

exports.createOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, items, notes } = req.body;
    const validPaymentMethods = ['card', 'upi', 'cod', 'wallet'];
    const method = paymentMethod === 'cash' ? 'cod' : paymentMethod;

    if (!addressId || !validPaymentMethods.includes(method) || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ success: false, message: 'Address, payment method, and items are required' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const address = user.addresses.id(addressId);
    if (!address) return res.status(400).json({ success: false, message: 'Delivery address not found' });

    let subtotal = 0;
    const orderItems = [];
    const products = new Map();
    const quantities = new Map();

    for (const item of items) {
      const quantity = Number(item.quantity);
      if (!mongoose.isValidObjectId(item.product) || !Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ success: false, message: 'Each item needs a product and positive quantity' });
      }

      const productId = item.product.toString();
      let product = products.get(productId);
      if (!product) {
        product = await Product.findById(productId);
        products.set(productId, product);
      }
      if (!product || !product.isActive) {
        return res.status(404).json({ success: false, message: 'Product not found' });
      }

      const price = Number(product.price);
      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({ success: false, message: `${product.name} has an invalid price` });
      }

      subtotal += price * quantity;
      orderItems.push({ product: product._id, quantity, price });
      quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }

    for (const [productId, quantity] of quantities) {
      if (products.get(productId).stock < quantity) {
        return res.status(409).json({ success: false, message: `${products.get(productId).name} does not have enough stock` });
      }
    }

    subtotal = Math.round(subtotal * 100) / 100;
    const reservations = await reserveInventory(orderItems);
    const order = new Order({
      user: req.user.userId,
      shippingAddress: address._id,
      items: orderItems,
      status: method === 'cod' ? 'processing' : 'pending',
      subtotal,
      total: subtotal,
      payment: { method, amount: subtotal },
      inventoryReserved: true,
      tracking: { trackingNumber: `ORD-${uuidv4().substring(0, 8).toUpperCase()}` },
      notes: typeof notes === 'string' ? notes.trim() : undefined
    });

    try {
      await order.save();
    } catch (error) {
      await restoreInventory(reservations);
      throw error;
    }
    await publishEvent(TOPICS.ORDER_EVENTS, {
      eventType: 'ORDER_CREATED',
      orderId: order._id.toString(),
      userId: req.user.userId,
      total: order.total,
      items: order.items.length,
      paymentMethod: method
    });
    if (method === 'cod') {
      await recordPaymentTransaction({
        order: order._id,
        user: order.user,
        provider: 'cash',
        status: 'pending',
        amountMinor: Math.round(order.total * 100),
        currency: 'INR',
        method,
        gatewayOrderId: `cod:${order._id}`
      });
    }
    res.status(201).json({ success: true, order });

  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const query = { user: req.user.userId };

    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate('items.product')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      user: req.user.userId
    }).populate(['items.product', 'deliveryAgent', 'coupon']);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      user: req.user.userId
    });

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ success: false, message: 'Order cannot be cancelled at this stage' });
    }

    const reservedItems = order.inventoryReserved ? order.items : [];
    if (reservedItems.length) {
      await restoreInventory(reservedItems);
    }

    order.status = 'cancelled';
    order.inventoryReserved = false;
    try {
      await order.save();
    } catch (error) {
      if (reservedItems.length) await reserveInventory(reservedItems);
      throw error;
    }
    res.json({ success: true, message: 'Order cancelled successfully', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.reorder = async (req, res) => {
  try {
    const originalOrder = await Order.findOne({
      _id: req.params.orderId,
      user: req.user.userId
    });

    if (!originalOrder) return res.status(404).json({ success: false, message: 'Order not found' });

    const reservations = await reserveInventory(originalOrder.items);

    const newOrder = new Order({
      user: req.user.userId,
      items: originalOrder.items,
      total: originalOrder.total,
      subtotal: originalOrder.subtotal,
      tax: originalOrder.tax,
      discount: originalOrder.discount,
      coupon: originalOrder.coupon,
      shippingAddress: originalOrder.shippingAddress,
      payment: {
        method: originalOrder.payment.method,
        status: 'pending',
        amount: originalOrder.total
      },
      inventoryReserved: true
    });

    newOrder.tracking.trackingNumber = `ORD-${uuidv4().substring(0, 8).toUpperCase()}`;

    try {
      await newOrder.save();
    } catch (error) {
      await restoreInventory(reservations);
      throw error;
    }

    await newOrder.populate(['items.product', 'coupon']);
    res.status(201).json({ success: true, order: newOrder });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.getOrderInvoice = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      user: req.user.userId
    }).populate(['items.product', 'coupon']);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Generate invoice data (in a real app, you'd use a PDF library)
    const invoice = {
      orderId: order._id,
      orderNumber: order.tracking.trackingNumber,
      date: order.createdAt,
      customer: {
        name: req.user.name,
        email: req.user.email
      },
      items: order.items.map(item => ({
        name: item.product.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      })),
      subtotal: order.subtotal,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      shippingAddress: order.shippingAddress
    };

    res.json({ success: true, invoice });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin functions
exports.getAllOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, user } = req.query;
    const query = {};

    if (status) query.status = status;
    if (user) query.user = user;

    const orders = await Order.find(query)
      .populate(['user', 'items.product', 'deliveryAgent'])
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    res.json({
      success: true,
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.orderId)
      .populate(['user', 'items.product', 'deliveryAgent']);

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const oldStatus = order.status;
    order.status = status;

    if (status === 'shipped') {
      order.tracking.status = 'Shipped';
      order.tracking.estimatedDelivery = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days
    } else if (status === 'delivered') {
      order.tracking.status = 'Delivered';
      order.payment.status = 'completed';
    }

    await order.save();

    // Publish order status update event
    await publishEvent(TOPICS.ORDER_EVENTS, {
      eventType: 'ORDER_STATUS_UPDATED',
      orderId: order._id,
      userId: order.user._id,
      oldStatus,
      newStatus: status,
      trackingNumber: order.tracking.trackingNumber
    });

    // Publish delivery tracking event if status changed to shipped or delivered
    if (status === 'shipped' || status === 'delivered') {
      await publishEvent(TOPICS.DELIVERY_TRACKING, {
        eventType: 'DELIVERY_STATUS_UPDATE',
        orderId: order._id,
        status: order.tracking.status,
        estimatedDelivery: order.tracking.estimatedDelivery,
        deliveryAgentId: order.deliveryAgent?._id
      });
    }

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};