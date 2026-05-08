const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const deliveryAuth = require('../middleware/delivery');

/**
 * @swagger
 * /api/delivery/login:
 *   post:
 *     summary: Delivery partner login
 *     tags: [Delivery]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Unauthorized
 */
router.post('/login', deliveryController.login);

/**
 * @swagger
 * /api/delivery/orders:
 *   get:
 *     summary: Get delivery orders
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [assigned, available]
 *           default: assigned
 *     responses:
 *       200:
 *         description: List of orders
 *       401:
 *         description: Unauthorized
 */
router.get('/orders', deliveryAuth, deliveryController.getOrders);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/accept:
 *   put:
 *     summary: Accept delivery order
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order accepted
 *       400:
 *         description: Order not available
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.put('/orders/:orderId/accept', deliveryAuth, deliveryController.acceptOrder);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/picked:
 *   put:
 *     summary: Mark order as picked up
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order marked as picked
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.put('/orders/:orderId/picked', deliveryAuth, deliveryController.markPicked);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/delivered:
 *   put:
 *     summary: Mark order as delivered
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Order marked as delivered
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.put('/orders/:orderId/delivered', deliveryAuth, deliveryController.markDelivered);

/**
 * @swagger
 * /api/delivery/earnings:
 *   get:
 *     summary: Get delivery earnings
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Earnings data
 *       401:
 *         description: Unauthorized
 */
router.get('/earnings', deliveryAuth, deliveryController.getEarnings);

/**
 * @swagger
 * /api/delivery/location:
 *   put:
 *     summary: Update delivery agent location
 *     tags: [Delivery]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       200:
 *         description: Location updated
 *       401:
 *         description: Unauthorized
 */
router.put('/location', deliveryAuth, deliveryController.updateLocation);

module.exports = router;