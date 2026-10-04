const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

router.get('/transactions', auth, paymentController.getTransactions);
router.get('/admin/transactions', auth, admin, paymentController.getAllTransactions);

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
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
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
 * /api/payments/webhook:
 *   post:
 *     summary: Process a signed Stripe or Razorpay webhook
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: Webhook accepted
 *       400:
 *         description: Missing or invalid provider signature
 */
router.post('/webhook', paymentController.handleWebhook);

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
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: string
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
router.post('/webhook/stripe', paymentController.handleStripeWebhook);

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
router.post('/webhook/razorpay', paymentController.handleRazorpayWebhook);

module.exports = router;