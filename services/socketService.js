const Order = require('../models/Order');

class SocketService {
  constructor(io) {
    this.io = io;
    this.activeConnections = new Map(); // userId -> socket
    this.orderRooms = new Map(); // orderId -> Set of socket IDs

    this.initializeSocketHandlers();
  }

  initializeSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User ${socket.userId} connected with socket ${socket.id}`);

      // Store active connection
      this.activeConnections.set(socket.userId, socket);

      // Handle order tracking subscription
      socket.on('subscribe-order-tracking', async (orderId) => {
        try {
          // Verify user has access to this order
          const order = await Order.findOne({
            _id: orderId,
            $or: [
              { user: socket.userId },
              { deliveryAgent: socket.userId },
              // Admin can subscribe to any order
              ...(socket.isAdmin ? [{}] : [])
            ]
          });

          if (!order) {
            socket.emit('error', { message: 'Order not found or access denied' });
            return;
          }

          // Join order room
          socket.join(`order-${orderId}`);

          // Initialize order room tracking
          if (!this.orderRooms.has(orderId)) {
            this.orderRooms.set(orderId, new Set());
          }
          this.orderRooms.get(orderId).add(socket.id);

          console.log(`Socket ${socket.id} subscribed to order ${orderId}`);

          // Send current order status
          socket.emit('order-update', {
            orderId,
            status: order.status,
            tracking: order.tracking,
            deliveryAgent: order.deliveryAgent,
            estimatedDelivery: order.tracking.estimatedDelivery
          });

        } catch (error) {
          console.error('Error subscribing to order tracking:', error);
          socket.emit('error', { message: 'Failed to subscribe to order tracking' });
        }
      });

      // Handle order tracking unsubscription
      socket.on('unsubscribe-order-tracking', (orderId) => {
        socket.leave(`order-${orderId}`);

        const room = this.orderRooms.get(orderId);
        if (room) {
          room.delete(socket.id);
          if (room.size === 0) {
            this.orderRooms.delete(orderId);
          }
        }

        console.log(`Socket ${socket.id} unsubscribed from order ${orderId}`);
      });

      // Handle delivery agent location updates
      socket.on('update-location', async (data) => {
        try {
          if (!socket.isDeliveryPartner) {
            socket.emit('error', { message: 'Only delivery partners can update location' });
            return;
          }

          const { latitude, longitude, orderId } = data;

          // Update delivery agent location in database
          const DeliveryAgent = require('../models/DeliveryAgent');
          await DeliveryAgent.findOneAndUpdate(
            { user: socket.userId },
            {
              location: { latitude, longitude },
              lastLocationUpdate: new Date()
            }
          );

          // If orderId is provided, emit location update to order subscribers
          if (orderId) {
            this.io.to(`order-${orderId}`).emit('delivery-location-update', {
              orderId,
              deliveryAgentId: socket.userId,
              location: { latitude, longitude },
              timestamp: new Date()
            });
          }

        } catch (error) {
          console.error('Error updating location:', error);
          socket.emit('error', { message: 'Failed to update location' });
        }
      });

      // Handle disconnect
      socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected`);

        // Remove from active connections
        this.activeConnections.delete(socket.userId);

        // Remove from all order rooms
        for (const [orderId, sockets] of this.orderRooms.entries()) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            this.orderRooms.delete(orderId);
          }
        }
      });
    });
  }

  // Method to emit order updates to subscribers
  emitOrderUpdate(orderId, updateData) {
    this.io.to(`order-${orderId}`).emit('order-update', {
      orderId,
      ...updateData,
      timestamp: new Date()
    });
  }

  // Method to emit delivery tracking updates
  emitDeliveryUpdate(orderId, trackingData) {
    this.io.to(`order-${orderId}`).emit('delivery-tracking-update', {
      orderId,
      ...trackingData,
      timestamp: new Date()
    });
  }

  // Method to emit notifications to specific users
  emitNotificationToUser(userId, notificationData) {
    const socket = this.activeConnections.get(userId);
    if (socket) {
      socket.emit('notification', notificationData);
    }
  }

  // Method to broadcast to all connected users (admin feature)
  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  // Get active connections count
  getActiveConnectionsCount() {
    return this.activeConnections.size;
  }

  // Get order room subscribers count
  getOrderSubscribersCount(orderId) {
    const room = this.orderRooms.get(orderId);
    return room ? room.size : 0;
  }
}

module.exports = (io) => {
  const socketService = new SocketService(io);

  // Export methods for use in other parts of the application
  global.socketService = socketService;

  return socketService;
};