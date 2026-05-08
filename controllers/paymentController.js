const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../models/Order');
const { publishEvent, TOPICS } = require('../config/kafka');

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
    await publishEvent(TOPICS.PAYMENT_EVENTS, {
      eventType: 'PAYMENT_ORDER_CREATED',
      userId: req.user.userId,
      amount,
      currency,
      paymentIntentId: paymentIntent.id
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
        await publishEvent(TOPICS.PAYMENT_EVENTS, {
          eventType: 'PAYMENT_SUCCESS',
          orderId,
          userId: order.user.toString(),
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          paymentIntentId,
          transactionId: paymentIntentId
        });

        // Publish order payment completed event
        await publishEvent(TOPICS.ORDER_EVENTS, {
          eventType: 'ORDER_PAYMENT_COMPLETED',
          orderId,
          userId: order.user.toString(),
          amount: order.total,
          paymentMethod: order.payment.method
        });
      }

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
    res.status(500).json({ message: err.message });
  }
};

exports.getPaymentMethods = async (req, res) => {
  try {
    // Return available payment methods
    res.json({
      methods: [
        { id: 'card', name: 'Credit/Debit Card', provider: 'stripe' },
        { id: 'upi', name: 'UPI', provider: 'razorpay' },
        { id: 'cod', name: 'Cash on Delivery', provider: 'internal' },
        { id: 'wallet', name: 'Wallet', provider: 'internal' }
      ]
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.handleWebhook = async (req, res) => {
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
    res.status(500).json({ message: err.message });
  }
};