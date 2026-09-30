const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../models/Order');
const { publishEvent, TOPICS } = require('../config/kafka');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

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
      order.status = 'confirmed';
      await order.save();

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
      // Publish payment failed event
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
    order.status = 'confirmed';
    await order.save();

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
        await Order.findOneAndUpdate(
          { 'payment.gatewayOrderId': paymentIntent.id },
          {
            'payment.status': 'completed',
            'payment.transactionId': paymentIntent.id,
            status: 'confirmed'
          }
        );
        break;
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        await Order.findOneAndUpdate(
          { 'payment.gatewayOrderId': failedPayment.id },
          { 'payment.status': 'failed' }
        );
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

    switch (event.event) {
      case 'payment.authorized':
      case 'payment.captured':
        const payment = event.payload.payment.entity;
        await Order.findOneAndUpdate(
          { 'payment.gatewayOrderId': payment.order_id },
          {
            'payment.status': 'completed',
            'payment.transactionId': payment.id,
            status: 'confirmed'
          }
        );

        // Publish payment success event
        await publishEvent(TOPICS.PAYMENT_EVENTS, {
          eventType: 'RAZORPAY_PAYMENT_CAPTURED',
          razorpayPaymentId: payment.id,
          amount: payment.amount / 100,
          currency: payment.currency
        });
        break;

      case 'payment.failed':
        const failedPayment = event.payload.payment.entity;
        await Order.findOneAndUpdate(
          { 'payment.gatewayOrderId': failedPayment.order_id },
          { 'payment.status': 'failed', 'payment.transactionId': failedPayment.id }
        );

        // Publish payment failed event
        await publishEvent(TOPICS.PAYMENT_EVENTS, {
          eventType: 'RAZORPAY_PAYMENT_FAILED',
          razorpayPaymentId: failedPayment.id,
          reason: failedPayment.description
        });
        break;

      case 'refund.created':
        const refund = event.payload.refund.entity;
        await Order.findOneAndUpdate(
          { 'payment.transactionId': refund.payment_id },
          { 'payment.status': 'refunded' }
        );

        // Publish refund event
        await publishEvent(TOPICS.PAYMENT_EVENTS, {
          eventType: 'RAZORPAY_REFUND_CREATED',
          razorpayPaymentId: refund.payment_id,
          refundId: refund.id,
          amount: refund.amount / 100
        });
        break;

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