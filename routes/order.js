const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create a new order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shippingAddress
 *               - paymentMethod
 *             properties:
 *               shippingAddress:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                     enum: [home, work, other]
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   zipCode:
 *                     type: string
 *                   country:
 *                     type: string
 *                   coordinates:
 *                     type: object
 *                     properties:
 *                       latitude:
 *                         type: number
 *                       longitude:
 *                         type: number
 *               paymentMethod:
 *                 type: string
 *                 enum: [card, upi, cod, wallet]
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/', auth, orderController.createOrder);

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get user's orders
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, processing, shipped, delivered, cancelled, refunded]
 *     responses:
 *       200:
 *         description: List of user's orders
 *       401:
 *         description: Unauthorized
 */
router.get('/', auth, orderController.getOrders);

/**
 * @swagger
 * /api/orders/{orderId}:
 *   get:
 *     summary: Get order by ID
 *     tags: [Orders]
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
 *         description: Order details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.get('/:orderId', auth, orderController.getOrderById);

/**
 * @swagger
 * /api/orders/{orderId}/cancel:
 *   put:
 *     summary: Cancel an order
 *     tags: [Orders]
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
 *         description: Order cancelled successfully
 *       400:
 *         description: Order cannot be cancelled
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.put('/:orderId/cancel', auth, orderController.cancelOrder);

/**
 * @swagger
 * /api/orders/{orderId}/reorder:
 *   post:
 *     summary: Reorder from existing order
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Reorder created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.post('/:orderId/reorder', auth, orderController.reorder);

/**
 * @swagger
 * /api/orders/{orderId}/invoice:
 *   get:
 *     summary: Get order invoice
 *     tags: [Orders]
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
 *         description: Order invoice data
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.get('/:orderId/invoice', auth, orderController.getOrderInvoice);

/**
 * @swagger
 * /api/orders/{orderId}/track:
 *   get:
 *     summary: Track order delivery
 *     tags: [Orders]
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
 *         description: Order tracking information
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.get('/:orderId/track', auth, async (req, res) => {
  try {
    const order = await require('../models/Order').findOne({
      _id: req.params.orderId,
      user: req.user.userId
    }).populate('deliveryAgent');

    if (!order) return res.status(404).json({ message: 'Order not found' });

    res.json({
      orderId: order._id,
      status: order.status,
      tracking: order.tracking,
      deliveryAgent: order.deliveryAgent ? {
        name: order.deliveryAgent.user.name,
        phone: order.deliveryAgent.user.phone,
        vehicleType: order.deliveryAgent.vehicleType
      } : null
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin routes
/**
 * @swagger
 * /api/admin/orders:
 *   get:
 *     summary: Get all orders (Admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: user
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of all orders
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 */
router.get('/admin/orders', auth, admin, orderController.getAllOrders);

/**
 * @swagger
 * /api/admin/orders/{orderId}/status:
 *   put:
 *     summary: Update order status (Admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, confirmed, processing, shipped, delivered, cancelled, refunded]
 *     responses:
 *       200:
 *         description: Order status updated
 *       400:
 *         description: Invalid status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Order not found
 */
router.put('/admin/orders/:orderId/status', auth, admin, orderController.updateOrderStatus);

/**
 * @swagger
 * /api/orders/{orderId}/ws-info:
 *   get:
 *     summary: Get WebSocket connection info for order tracking
 *     tags: [Orders]
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
 *         description: WebSocket connection information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 wsUrl:
 *                   type: string
 *                   description: WebSocket server URL
 *                 orderId:
 *                   type: string
 *                   description: Order ID for subscription
 *                 activeConnections:
 *                   type: integer
 *                   description: Number of active WebSocket connections
 *                 orderSubscribers:
 *                   type: integer
 *                   description: Number of subscribers to this order
 *                 currentStatus:
 *                   type: object
 *                   description: Current order tracking status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Order not found
 */
router.get('/:orderId/ws-info', auth, async (req, res) => {
  try {
    const Order = require('../models/Order');
    const order = await Order.findOne({
      _id: req.params.orderId,
      user: req.user.userId
    }).populate('deliveryAgent', 'user');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const wsInfo = {
      wsUrl: `${req.protocol}://${req.get('host')}`,
      orderId: order._id,
      activeConnections: global.socketService ? global.socketService.getActiveConnectionsCount() : 0,
      orderSubscribers: global.socketService ? global.socketService.getOrderSubscribersCount(order._id) : 0,
      currentStatus: {
        status: order.status,
        tracking: order.tracking,
        deliveryAgent: order.deliveryAgent,
        estimatedDelivery: order.tracking.estimatedDelivery
      }
    };

    res.json(wsInfo);
  } catch (error) {
    console.error('Error getting WebSocket info:', error);
    res.status(500).json({ message: 'Failed to get WebSocket information' });
  }
});

module.exports = router; 