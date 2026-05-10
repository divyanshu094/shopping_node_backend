const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/auth');

/**
 * @swagger
 * /api/payments/create-order:
 *   post:
 *     summary: Create payment order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *                 default: inr
 *     responses:
 *       200:
 *         description: Payment order created
 *       401:
 *         description: Unauthorized
 */
router.post('/create-order', auth, paymentController.createOrder);

/**
 * @swagger
 * /api/payments/verify:
 *   post:
 *     summary: Verify payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentIntentId
 *               - orderId
 *             properties:
 *               paymentIntentId:
 *                 type: string
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified
 *       400:
 *         description: Payment verification failed
 *       401:
 *         description: Unauthorized
 */
router.post('/verify', auth, paymentController.verifyPayment);

/**
 * @swagger
 * /api/payments/methods:
 *   get:
 *     summary: Get available payment methods
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of payment methods
 *       401:
 *         description: Unauthorized
 */
router.get('/methods', auth, paymentController.getPaymentMethods);

/**
 * @swagger
 * /api/payments/razorpay/create-order:
 *   post:
 *     summary: Create Razorpay payment order
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *                 default: INR
 *               method:
 *                 type: string
 *                 enum: [upi, netbanking, card, wallets]
 *     responses:
 *       200:
 *         description: Razorpay order created
 *       401:
 *         description: Unauthorized
 */
router.post('/razorpay/create-order', auth, paymentController.createRazorpayOrder);

/**
 * @swagger
 * /api/payments/razorpay/verify:
 *   post:
 *     summary: Verify Razorpay payment
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *               - razorpay_payment_id
 *               - razorpay_signature
 *               - orderId
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               razorpay_payment_id:
 *                 type: string
 *               razorpay_signature:
 *                 type: string
 *               orderId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Razorpay payment verified
 *       400:
 *         description: Payment verification failed
 *       401:
 *         description: Unauthorized
 */
router.post('/razorpay/verify', auth, paymentController.verifyRazorpayPayment);

/**
 * @swagger
 * /api/payments/webhook/stripe:
 *   post:
 *     summary: Stripe webhook handler
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 */
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), paymentController.handleStripeWebhook);

/**
 * @swagger
 * /api/payments/webhook/razorpay:
 *   post:
 *     summary: Razorpay webhook handler
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook processed
 */
router.post('/webhook/razorpay', express.raw({ type: 'application/json' }), paymentController.handleRazorpayWebhook);

module.exports = router;