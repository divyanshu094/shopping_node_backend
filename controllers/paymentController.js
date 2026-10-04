const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const PaymentTransaction = require('../models/PaymentTransaction');
const { publishEvent, TOPICS } = require('../config/kafka');
const { recordPaymentTransaction } = require('../services/paymentLedger');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

const listTransactions = async (req, res, adminView) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));
    const query = adminView ? {} : { user: req.user.userId };

    if (adminView && req.query.userId) {
      if (!mongoose.isValidObjectId(req.query.userId)) {
        return res.status(400).json({ success: false, message: 'Invalid user ID' });
      }
      query.user = req.query.userId;
    }
    if (req.query.orderId) {
      if (!mongoose.isValidObjectId(req.query.orderId)) {
        return res.status(400).json({ success: false, message: 'Invalid order ID' });
      }
      query.order = req.query.orderId;
    }
    if (req.query.provider) query.provider = req.query.provider;
    if (req.query.status) query.status = req.query.status;
    if (req.query.type) query.type = req.query.type;

    const [transactions, total] = await Promise.all([
      PaymentTransaction.find(query)
        .populate('order', 'status tracking.trackingNumber')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PaymentTransaction.countDocuments(query)
    ]);

    res.json({
      success: true,
      transactions,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTransactions = (req, res) => listTransactions(req, res, false);
exports.getAllTransactions = (req, res) => listTransactions(req, res, true);

exports.createOrder = async (req, res) => {
  try {
    const { orderId, currency = 'inr' } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user.userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.payment.method === 'cod' || order.payment.status === 'completed') {
      return res.status(409).json({ success: false, message: 'This order cannot be paid online' });
    }

    const amount = Math.round(order.total * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Order amount is invalid' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      metadata: {
        userId: req.user.userId,
        orderId: order._id.toString()
      }
    });

    order.payment.gatewayOrderId = paymentIntent.id;
    order.payment.amount = order.total;
    await order.save();
    await recordPaymentTransaction({
      order: order._id,
      user: order.user,
      provider: 'stripe',
      status: 'pending',
      amountMinor: amount,
      currency: paymentIntent.currency,
      method: order.payment.method,
      gatewayOrderId: paymentIntent.id,
      gatewayPaymentId: paymentIntent.id
    });

    // Publish payment order created event
    await publishEvent(TOPICS.PAYMENT_EVENTS, {
      eventType: 'PAYMENT_ORDER_CREATED',
      userId: req.user.userId,
      amount: order.total,
      currency,
      paymentIntentId: paymentIntent.id,
      orderId: order._id.toString()
    });

    res.json({
      success: true,
      orderId: order._id,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { paymentIntentId, orderId } = req.body;
    if (!paymentIntentId || !orderId) {
      return res.status(400).json({ success: false, message: 'Payment intent and order ID are required' });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user.userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.payment.status === 'completed' && order.payment.transactionId === paymentIntentId) {
      await recordPaymentTransaction({
        order: order._id,
        user: order.user,
        provider: 'stripe',
        status: 'completed',
        amountMinor: Math.round(order.total * 100),
        currency: 'INR',
        method: order.payment.method,
        gatewayOrderId: paymentIntentId,
        gatewayPaymentId: paymentIntentId
      });
      return res.json({ success: true, message: 'Payment already verified' });
    }
    if (order.payment.gatewayOrderId !== paymentIntentId) {
      return res.status(400).json({ success: false, message: 'Payment does not match this order' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    const expectedAmount = Math.round(order.total * 100);
    if (paymentIntent.metadata?.orderId !== order._id.toString() || paymentIntent.amount !== expectedAmount) {
      return res.status(400).json({ success: false, message: 'Payment amount or order does not match' });
    }

    if (paymentIntent.status === 'succeeded') {
      order.payment.status = 'completed';
      order.payment.transactionId = paymentIntentId;
      order.status = 'processing';
      await order.save();
      await recordPaymentTransaction({
        order: order._id,
        user: order.user,
        provider: 'stripe',
        status: 'completed',
        amountMinor: paymentIntent.amount,
        currency: paymentIntent.currency,
        method: order.payment.method,
        gatewayOrderId: paymentIntentId,
        gatewayPaymentId: paymentIntentId
      });

      await publishEvent(TOPICS.PAYMENT_EVENTS, {
        eventType: 'PAYMENT_SUCCESS',
        orderId,
        userId: order.user.toString(),
        amount: order.total,
        currency: paymentIntent.currency,
        paymentIntentId,
        transactionId: paymentIntentId
      });
      await publishEvent(TOPICS.ORDER_EVENTS, {
        eventType: 'ORDER_PAYMENT_COMPLETED',
        orderId,
        userId: order.user.toString(),
        amount: order.total,
        paymentMethod: order.payment.method
      });

      res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      const failed = ['requires_payment_method', 'canceled'].includes(paymentIntent.status);
      await recordPaymentTransaction({
        order: order._id,
        user: order.user,
        provider: 'stripe',
        status: failed ? (paymentIntent.status === 'canceled' ? 'cancelled' : 'failed') : 'pending',
        amountMinor: paymentIntent.amount,
        currency: paymentIntent.currency,
        method: order.payment.method,
        gatewayOrderId: paymentIntentId,
        gatewayPaymentId: paymentIntentId,
        failureCode: paymentIntent.last_payment_error?.code,
        failureDescription: paymentIntent.last_payment_error?.message || paymentIntent.status
      });
      await publishEvent(TOPICS.PAYMENT_EVENTS, {
        eventType: 'PAYMENT_FAILED',
        paymentIntentId,
        orderId,
        status: paymentIntent.status
      });

      res.status(400).json({ success: false, message: 'Payment not completed' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user.userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.payment.method === 'cod' || order.payment.status === 'completed') {
      return res.status(409).json({ success: false, message: 'This order cannot be paid online' });
    }

    const options = {
      amount: Math.round(order.total * 100),
      currency: 'INR',
      receipt: `order_${order._id}`,
      payment_capture: 1,
      notes: {
        userId: req.user.userId,
        appOrderId: order._id.toString()
      }
    };

    const razorpayOrder = await razorpay.orders.create(options);
    order.payment.gatewayOrderId = razorpayOrder.id;
    order.payment.amount = order.total;
    await order.save();
    await recordPaymentTransaction({
      order: order._id,
      user: order.user,
      provider: 'razorpay',
      status: 'pending',
      amountMinor: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      method: order.payment.method,
      gatewayOrderId: razorpayOrder.id
    });

    // Publish razorpay order created event
    await publishEvent(TOPICS.PAYMENT_EVENTS, {
      eventType: 'RAZORPAY_ORDER_CREATED',
      userId: req.user.userId,
      amount: order.total,
      currency: 'INR',
      orderId: razorpayOrder.id,
      paymentMethod: order.payment.method
    });

    res.json({
      success: true,
      orderId: razorpayOrder.id,
      appOrderId: order._id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key: process.env.RAZORPAY_KEY_ID,
      method: {
          upi: true,
          card: true,
          netbanking: true,
          wallet: true
        }
    });
  } catch (err) {
    console.log('Error creating Razorpay order:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({ success: false, message: 'Payment details are incomplete' });
    }

    const order = await Order.findOne({ _id: orderId, user: req.user.userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    if (order.payment.status === 'completed' && order.payment.transactionId === razorpay_payment_id) {
      await recordPaymentTransaction({
        order: order._id,
        user: order.user,
        provider: 'razorpay',
        status: 'completed',
        amountMinor: Math.round(order.total * 100),
        currency: 'INR',
        method: order.payment.method,
        gatewayOrderId: razorpay_order_id,
        gatewayPaymentId: razorpay_payment_id
      });
      return res.json({ success: true, message: 'Payment already verified' });
    }
    if (order.payment.gatewayOrderId !== razorpay_order_id) {
      return res.status(400).json({ success: false, message: 'Payment does not match this order' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');
    const signatureIsValid = /^[a-f0-9]{64}$/i.test(razorpay_signature) &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(razorpay_signature, 'hex'));

    if (!signatureIsValid) {
      await recordPaymentTransaction({
        order: order._id,
        user: order.user,
        provider: 'razorpay',
        status: 'failed',
        amountMinor: Math.round(order.total * 100),
        currency: 'INR',
        method: order.payment.method,
        gatewayOrderId: razorpay_order_id,
        gatewayPaymentId: razorpay_payment_id,
        failureCode: 'invalid_signature',
        failureDescription: 'Payment signature verification failed'
      });
      // Publish payment failed event
      await publishEvent(TOPICS.PAYMENT_EVENTS, {
        eventType: 'PAYMENT_FAILED',
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        reason: 'Invalid signature'
      });

      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    order.payment.status = 'completed';
    order.payment.transactionId = razorpay_payment_id;
    order.status = 'processing';
    await order.save();
    await recordPaymentTransaction({
      order: order._id,
      user: order.user,
      provider: 'razorpay',
      status: 'completed',
      amountMinor: Math.round(order.total * 100),
      currency: 'INR',
      method: order.payment.method,
      gatewayOrderId: razorpay_order_id,
      gatewayPaymentId: razorpay_payment_id
    });

    await publishEvent(TOPICS.PAYMENT_EVENTS, {
      eventType: 'PAYMENT_SUCCESS',
      orderId,
      userId: order.user.toString(),
      amount: order.total,
      currency: 'INR',
      razorpayPaymentId: razorpay_payment_id,
      transactionId: razorpay_payment_id
    });
    await publishEvent(TOPICS.ORDER_EVENTS, {
      eventType: 'ORDER_PAYMENT_COMPLETED',
      orderId,
      userId: order.user.toString(),
      amount: order.total,
      paymentMethod: order.payment.method
    });

    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getPaymentMethods = async (req, res) => {
  try {
    // Return available payment methods
    res.json({
      success: true,
      methods: [
        { id: 'card', name: 'Credit/Debit Card', provider: 'stripe' },
        { id: 'upi', name: 'UPI', provider: 'razorpay' },
        { id: 'netbanking', name: 'Net Banking', provider: 'razorpay' },
        { id: 'wallets', name: 'Digital Wallets', provider: 'razorpay' },
        { id: 'cod', name: 'Cash on Delivery', provider: 'internal' },
        { id: 'wallet', name: 'Wallet', provider: 'internal' }
      ]
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.handleStripeWebhook = async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, endpointSecret);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        const paidOrder = await Order.findOne({ 'payment.gatewayOrderId': paymentIntent.id });
        if (paidOrder) {
          paidOrder.payment.status = 'completed';
          paidOrder.payment.transactionId = paymentIntent.id;
          paidOrder.status = 'processing';
          await paidOrder.save();
          await recordPaymentTransaction({
            order: paidOrder._id,
            user: paidOrder.user,
            provider: 'stripe',
            status: 'completed',
            amountMinor: paymentIntent.amount,
            currency: paymentIntent.currency,
            method: paidOrder.payment.method,
            gatewayOrderId: paymentIntent.id,
            gatewayPaymentId: paymentIntent.id,
            gatewayEventId: event.id
          });
        }
        break;
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        const failedOrder = await Order.findOne({ 'payment.gatewayOrderId': failedPayment.id });
        if (failedOrder) {
          if (failedOrder.payment.status !== 'completed') {
            failedOrder.payment.status = 'failed';
            await failedOrder.save();
          }
          await recordPaymentTransaction({
            order: failedOrder._id,
            user: failedOrder.user,
            provider: 'stripe',
            status: 'failed',
            amountMinor: failedPayment.amount,
            currency: failedPayment.currency,
            method: failedOrder.payment.method,
            gatewayOrderId: failedPayment.id,
            gatewayPaymentId: failedPayment.id,
            failureCode: failedPayment.last_payment_error?.code,
            failureDescription: failedPayment.last_payment_error?.message,
            gatewayEventId: event.id
          });
        }
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.handleRazorpayWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');
    const webhookSignature = req.headers['x-razorpay-signature'];

    if (!webhookSignature || !/^[a-f0-9]{64}$/i.test(webhookSignature) ||
      !crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(webhookSignature, 'hex'))) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawBody.toString('utf8'));

    const gatewayEventId = req.headers['x-razorpay-event-id'];

    switch (event.event) {
      case 'payment.authorized': {
        const payment = event.payload.payment.entity;
        const order = await Order.findOne({ 'payment.gatewayOrderId': payment.order_id });
        if (order) {
          await recordPaymentTransaction({
            order: order._id,
            user: order.user,
            provider: 'razorpay',
            status: 'authorized',
            amountMinor: payment.amount,
            currency: payment.currency,
            method: payment.method || order.payment.method,
            gatewayOrderId: payment.order_id,
            gatewayPaymentId: payment.id,
            gatewayEventId
          });
        }
        break;
      }

      case 'payment.captured': {
        const payment = event.payload.payment.entity;
        const order = await Order.findOne({ 'payment.gatewayOrderId': payment.order_id });
        if (order) {
          order.payment.status = 'completed';
          order.payment.transactionId = payment.id;
          order.status = 'processing';
          await order.save();
          await recordPaymentTransaction({
            order: order._id,
            user: order.user,
            provider: 'razorpay',
            status: 'completed',
            amountMinor: payment.amount,
            currency: payment.currency,
            method: payment.method || order.payment.method,
            gatewayOrderId: payment.order_id,
            gatewayPaymentId: payment.id,
            gatewayEventId
          });
        }

        await publishEvent(TOPICS.PAYMENT_EVENTS, {
          eventType: 'RAZORPAY_PAYMENT_CAPTURED',
          razorpayPaymentId: payment.id,
          amount: payment.amount / 100,
          currency: payment.currency
        });
        break;
      }

      case 'payment.failed': {
        const failedPayment = event.payload.payment.entity;
        const order = await Order.findOne({ 'payment.gatewayOrderId': failedPayment.order_id });
        if (order) {
          if (order.payment.status !== 'completed') {
            order.payment.status = 'failed';
            await order.save();
          }
          await recordPaymentTransaction({
            order: order._id,
            user: order.user,
            provider: 'razorpay',
            status: 'failed',
            amountMinor: failedPayment.amount,
            currency: failedPayment.currency,
            method: failedPayment.method || order.payment.method,
            gatewayOrderId: failedPayment.order_id,
            gatewayPaymentId: failedPayment.id,
            failureCode: failedPayment.error_code,
            failureDescription: failedPayment.error_description,
            gatewayEventId
          });
        }

        await publishEvent(TOPICS.PAYMENT_EVENTS, {
          eventType: 'RAZORPAY_PAYMENT_FAILED',
          razorpayPaymentId: failedPayment.id,
          reason: failedPayment.description
        });
        break;
      }

      case 'refund.created': {
        const refund = event.payload.refund.entity;
        const order = await Order.findOne({ 'payment.transactionId': refund.payment_id });
        if (order) {
          order.payment.status = 'refunded';
          order.status = 'refunded';
          await order.save();
          await recordPaymentTransaction({
            order: order._id,
            user: order.user,
            provider: 'razorpay',
            type: 'refund',
            status: 'completed',
            amountMinor: refund.amount,
            currency: refund.currency || 'INR',
            method: order.payment.method,
            gatewayOrderId: order.payment.gatewayOrderId,
            gatewayPaymentId: refund.payment_id,
            gatewayRefundId: refund.id,
            gatewayEventId
          });
        }

        await publishEvent(TOPICS.PAYMENT_EVENTS, {
          eventType: 'RAZORPAY_REFUND_CREATED',
          razorpayPaymentId: refund.payment_id,
          refundId: refund.id,
          amount: refund.amount / 100
        });
        break;
      }

      default:
        console.log(`Unhandled Razorpay event: ${event.event}`);
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Razorpay webhook error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.handleWebhook = (req, res) => {
  if (req.headers['stripe-signature']) {
    return exports.handleStripeWebhook(req, res);
  }
  if (req.headers['x-razorpay-signature']) {
    return exports.handleRazorpayWebhook(req, res);
  }
  return res.status(400).json({ success: false, message: 'Provider signature is required' });
};