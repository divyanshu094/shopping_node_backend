const { consumeEvents, TOPICS } = require('../config/kafka');
const Order = require('../models/Order');
const Notification = require('../models/Notification');

// Event handlers
const eventHandlers = {
  [TOPICS.ORDER_EVENTS]: async (event) => {
    console.log('Processing order event:', event);

    switch (event.eventType) {
      case 'ORDER_CREATED':
        // Create notification for user
        await Notification.create({
          user: event.userId,
          title: 'Order Placed Successfully',
          message: `Your order #${event.orderId} has been placed successfully.`,
          type: 'order',
          data: { orderId: event.orderId }
        });

        // Emit real-time order update
        if (global.socketService) {
          global.socketService.emitOrderUpdate(event.orderId, {
            status: 'pending',
            message: 'Order created successfully'
          });
        }
        break;

      case 'ORDER_STATUS_UPDATED':
        // Create notification for status updates
        const statusMessages = {
          confirmed: 'Your order has been confirmed',
          processing: 'Your order is being processed',
          shipped: 'Your order has been shipped',
          delivered: 'Your order has been delivered',
          cancelled: 'Your order has been cancelled'
        };

        if (statusMessages[event.newStatus]) {
          await Notification.create({
            user: event.userId,
            title: 'Order Status Update',
            message: statusMessages[event.newStatus],
            type: 'order',
            data: { orderId: event.orderId, status: event.newStatus }
          });
        }

        // Emit real-time order status update
        if (global.socketService) {
          global.socketService.emitOrderUpdate(event.orderId, {
            status: event.newStatus,
            message: `Order status updated to ${event.newStatus}`
          });
        }
        break;

      case 'ORDER_DELIVERED':
        // Create delivery completion notification
        await Notification.create({
          user: event.userId,
          title: 'Order Delivered',
          message: 'Your order has been successfully delivered. Thank you for shopping with us!',
          type: 'order',
          data: { orderId: event.orderId }
        });

        // Emit real-time delivery update
        if (global.socketService) {
          global.socketService.emitOrderUpdate(event.orderId, {
            status: 'delivered',
            message: 'Order delivered successfully'
          });
        }
        break;
    }
  },

  [TOPICS.DELIVERY_TRACKING]: async (event) => {
    console.log('Processing delivery tracking event:', event);

    // Emit real-time delivery tracking updates
    if (global.socketService) {
      global.socketService.emitDeliveryUpdate(event.orderId, {
        status: event.status,
        location: event.location,
        deliveryAgentId: event.deliveryAgentId,
        message: `Order ${event.status.toLowerCase()}`
      });
    }

    // Create real-time notifications for delivery updates
    if (event.eventType === 'ORDER_PICKED_UP' || event.eventType === 'ORDER_DELIVERED') {
      await Notification.create({
        user: event.userId,
        title: 'Delivery Update',
        message: `Your order is ${event.status.toLowerCase()}`,
        type: 'delivery',
        data: {
          orderId: event.orderId,
          status: event.status,
          location: event.location
        }
      });
    }
  },

  [TOPICS.PAYMENT_EVENTS]: async (event) => {
    console.log('Processing payment event:', event);

    if (event.eventType === 'PAYMENT_SUCCESS') {
      await Notification.create({
        user: event.userId,
        title: 'Payment Successful',
        message: `Payment of ₹${event.amount} has been processed successfully.`,
        type: 'payment',
        data: {
          orderId: event.orderId,
          amount: event.amount,
          transactionId: event.transactionId
        }
      });

      // Emit real-time payment update
      if (global.socketService) {
        global.socketService.emitOrderUpdate(event.orderId, {
          paymentStatus: 'completed',
          message: 'Payment processed successfully'
        });
      }
    } else if (event.eventType === 'PAYMENT_FAILED') {
      await Notification.create({
        user: event.userId,
        title: 'Payment Failed',
        message: 'Your payment could not be processed. Please try again.',
        type: 'payment',
        data: { orderId: event.orderId }
      });

      // Emit real-time payment failure
      if (global.socketService) {
        global.socketService.emitOrderUpdate(event.orderId, {
          paymentStatus: 'failed',
          message: 'Payment processing failed'
        });
      }
    }
  },

  [TOPICS.INVENTORY_UPDATES]: async (event) => {
    console.log('Processing inventory update event:', event);

    // Handle low stock alerts, etc.
    if (event.eventType === 'STOCK_DECREASED') {
      // Check if product is low on stock and create admin notification
      const Product = require('../models/Product');
      const product = await Product.findById(event.productId);

      if (product && product.stock <= 10) { // Low stock threshold
        await Notification.create({
          user: null, // Admin notification
          title: 'Low Stock Alert',
          message: `Product "${product.name}" is running low on stock (${product.stock} remaining)`,
          type: 'admin',
          data: { productId: event.productId, stock: product.stock }
        });
      }
    }
  },

  [TOPICS.ANALYTICS]: async (event) => {
    console.log('Processing analytics event:', event);

    // Store analytics data for reporting
    // This could be used to aggregate data for dashboards
    if (event.eventType === 'ANALYTICS_DATA_REQUESTED') {
      // Log analytics access for audit purposes
      console.log(`Analytics data requested for period: ${event.period} by user: ${event.requestedBy}`);
    }
  },

  [TOPICS.NOTIFICATIONS]: async (event) => {
    console.log('Processing notification event:', event);

    // Handle push notifications, email notifications, etc.
    if (event.eventType === 'NOTIFICATION_CREATED') {
      // Here you could integrate with push notification services
      // like Firebase, OneSignal, etc.
      console.log('Notification created for user:', event.userId);

      // Emit real-time notification to connected user
      if (global.socketService) {
        global.socketService.emitNotificationToUser(event.userId, {
          id: event.notificationId,
          title: event.title,
          message: event.message,
          type: event.type,
          data: event.data
        });
      }
    }
  }
};

// Start consuming events
const startEventConsumer = async () => {
  try {
    await consumeEvents(async (topic, event) => {
      const handler = eventHandlers[topic];
      if (handler) {
        await handler(event);
      } else {
        console.log(`No handler found for topic: ${topic}`);
      }
    });
  } catch (error) {
    console.error('Error in event consumer:', error);
  }
};

module.exports = {
  startEventConsumer
};