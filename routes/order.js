const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// User routes
router.post('/', auth, orderController.placeOrder);
router.get('/', auth, orderController.getUserOrders);
router.get('/:id', auth, orderController.getOrderById);

// Admin routes
router.get('/admin/all', auth, admin, orderController.getAllOrders);
router.put('/admin/:id/status', auth, admin, orderController.updateOrderStatus);

module.exports = router; 