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
    const { amount, currency = 'inr' } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount * 100, // Stripe expects amount in paisa
      currency,
      metadata: {
        userId: req.user.userId
      }
    });

    // Publish payment order created event
    // await publishEvent(TOPICS.PAYMENT_EVENTS, {
    //   eventType: 'PAYMENT_ORDER_CREATED',
    //   userId: req.user.userId,
    //   amount,
    //   currency,
    //   paymentIntentId: paymentIntent.id
    // });

    res.json({
      success: true,
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

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // Update order payment status
      const order = await Order.findById(orderId);
      if (order) {
        order.payment.status = 'completed';
        order.payment.transactionId = paymentIntentId;
        await order.save();

        // Publish payment success event
        // await publishEvent(TOPICS.PAYMENT_EVENTS, {
        //   eventType: 'PAYMENT_SUCCESS',
        //   orderId,
        //   userId: order.user.toString(),
        //   amount: paymentIntent.amount / 100,
        //   currency: paymentIntent.currency,
        //   paymentIntentId,
        //   transactionId: paymentIntentId
        // });

        // // Publish order payment completed event
        // await publishEvent(TOPICS.ORDER_EVENTS, {
        //   eventType: 'ORDER_PAYMENT_COMPLETED',
        //   orderId,
        //   userId: order.user.toString(),
        //   amount: order.total,
        //   paymentMethod: order.payment.method
        // });
      }

      res.json({ success: true, message: 'Payment verified successfully' });
    } else {
      // Publish payment failed event
      // await publishEvent(TOPICS.PAYMENT_EVENTS, {
      //   eventType: 'PAYMENT_FAILED',
      //   paymentIntentId,
      //   orderId,
      //   status: paymentIntent.status
      // });

      res.status(400).json({ success: false, message: 'Payment not completed' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', method = 'upi' } = req.body;

    const options = {
      amount: amount * 100, // Razorpay expects amount in paise
      currency,
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
      notes: {
        userId: req.user.userId
      }
    };

    const razorpayOrder = await razorpay.orders.create(options);

    // Publish razorpay order created event
    // await publishEvent(TOPICS.PAYMENT_EVENTS, {
    //   eventType: 'RAZORPAY_ORDER_CREATED',
    //   userId: req.user.userId,
    //   amount,
    //   currency,
    //   orderId: razorpayOrder.id,
    //   paymentMethod: method
    // });

    res.json({
      success: true,
      orderId: razorpayOrder.id,
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
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

    // Verify signature
    const sha = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    sha.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const digest = sha.digest('hex');

    if (digest !== razorpay_signature) {
      // Publish payment failed event
      // await publishEvent(TOPICS.PAYMENT_EVENTS, {
      //   eventType: 'PAYMENT_FAILED',
      //   razorpayOrderId: razorpay_order_id,
      //   razorpayPaymentId: razorpay_payment_id,
      //   reason: 'Invalid signature'
      // });

      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    // Update order payment status
    const order = await Order.findById(orderId);
    if (order) {
      order.payment.status = 'completed';
      order.payment.transactionId = razorpay_payment_id;
      order.payment.method = 'razorpay';
      await order.save();

      // Publish payment success event
      // await publishEvent(TOPICS.PAYMENT_EVENTS, {
      //   eventType: 'PAYMENT_SUCCESS',
      //   orderId,
      //   userId: order.user.toString(),
      //   amount: order.total,
      //   currency: 'INR',
      //   razorpayPaymentId: razorpay_payment_id,
      //   transactionId: razorpay_payment_id
      // });

      // // Publish order payment completed event
      // await publishEvent(TOPICS.ORDER_EVENTS, {
      //   eventType: 'ORDER_PAYMENT_COMPLETED',
      //   orderId,
      //   userId: order.user.toString(),
      //   amount: order.total,
      //   paymentMethod: 'razorpay'
      // });
    }

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
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        // Update order status
        await Order.findOneAndUpdate(
          { 'payment.transactionId': paymentIntent.id },
          { 'payment.status': 'completed' }
        );
        break;
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        await Order.findOneAndUpdate(
          { 'payment.transactionId': failedPayment.id },
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
    const sha = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET);
    sha.update(JSON.stringify(req.body));
    const digest = sha.digest('hex');
    const webhookSignature = req.headers['x-razorpay-signature'];

    if (digest !== webhookSignature) {
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }

    const event = req.body;

    switch (event.event) {
      case 'payment.authorized':
      case 'payment.captured':
        const payment = event.payload.payment.entity;
        await Order.findOneAndUpdate(
          { 'payment.transactionId': payment.id },
          {
            'payment.status': 'completed',
            'payment.method': 'razorpay'
          }
        );

        // Publish payment success event
        // await publishEvent(TOPICS.PAYMENT_EVENTS, {
        //   eventType: 'RAZORPAY_PAYMENT_CAPTURED',
        //   razorpayPaymentId: payment.id,
        //   amount: payment.amount / 100,
        //   currency: payment.currency
        // });
        break;

      case 'payment.failed':
        const failedPayment = event.payload.payment.entity;
        await Order.findOneAndUpdate(
          { 'payment.transactionId': failedPayment.id },
          { 'payment.status': 'failed' }
        );

        // Publish payment failed event
        // await publishEvent(TOPICS.PAYMENT_EVENTS, {
        //   eventType: 'RAZORPAY_PAYMENT_FAILED',
        //   razorpayPaymentId: failedPayment.id,
        //   reason: failedPayment.description
        // });
        break;

      case 'refund.created':
        const refund = event.payload.refund.entity;
        await Order.findOneAndUpdate(
          { 'payment.transactionId': refund.payment_id },
          { 'payment.status': 'refunded' }
        );

        // Publish refund event
        // await publishEvent(TOPICS.PAYMENT_EVENTS, {
        //   eventType: 'RAZORPAY_REFUND_CREATED',
        //   razorpayPaymentId: refund.payment_id,
        //   refundId: refund.id,
        //   amount: refund.amount / 100
        // });
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