# Shopping Node Backend

A comprehensive e-commerce backend API built with Node.js, Express, and MongoDB, featuring real-time event streaming with Apache Kafka.

## Features

### Core APIs
- **Authentication**: User registration, login, OTP verification, password reset
- **User Management**: Profile management, address management
- **Product Management**: Product catalog, search, filtering, reviews
- **Cart Management**: Shopping cart with coupon support
- **Order Management**: Order lifecycle, tracking, invoice generation
- **Payment Processing**: Stripe integration for secure payments
- **Delivery Tracking**: Real-time delivery updates
- **Admin Panel**: Analytics, user management, product management
- **Notifications**: Push notifications and in-app notifications

### Real-time Event Streaming (Kafka Integration)
- **Order Events**: Order creation, status updates, delivery tracking
- **Payment Events**: Payment processing, success/failure notifications
- **Inventory Updates**: Stock management, low stock alerts
- **Analytics**: Business metrics and reporting data
- **Notifications**: Real-time notification delivery

## Real-time WebSocket API

The application provides real-time order tracking via WebSocket connections using Socket.io.

### WebSocket Connection

Connect to the WebSocket server at: `ws://localhost:3000` (or your server URL)

**Authentication**: Include JWT token in connection handshake:
```javascript
const socket = io('ws://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Order Tracking

Subscribe to real-time order updates:

```javascript
// Subscribe to order tracking
socket.emit('subscribe-order-tracking', 'order-id-here');

// Listen for order updates
socket.on('order-update', (data) => {
  console.log('Order update:', data);
  // data: { orderId, status, tracking, deliveryAgent, estimatedDelivery, timestamp }
});

// Listen for delivery tracking updates
socket.on('delivery-tracking-update', (data) => {
  console.log('Delivery update:', data);
  // data: { orderId, status, location, deliveryAgentId, timestamp }
});

// Listen for delivery agent location updates
socket.on('delivery-location-update', (data) => {
  console.log('Location update:', data);
  // data: { orderId, deliveryAgentId, location: { latitude, longitude }, timestamp }
});

// Unsubscribe from order tracking
socket.emit('unsubscribe-order-tracking', 'order-id-here');
```

### Delivery Agent Features

Delivery agents can update their location in real-time:

```javascript
// Update location (for delivery agents only)
socket.emit('update-location', {
  latitude: 12.9716,
  longitude: 77.5946,
  orderId: 'order-id-here' // optional
});
```

### REST API for WebSocket Info

Get WebSocket connection information:

```
GET /api/orders/{orderId}/ws-info
```

Response:
```json
{
  "wsUrl": "http://localhost:3000",
  "orderId": "60f7b3b3b3b3b3b3b3b3b3b3",
  "activeConnections": 5,
  "orderSubscribers": 2,
  "currentStatus": {
    "status": "shipped",
    "tracking": {
      "status": "Out for delivery",
      "trackingNumber": "ORD-ABC123",
      "estimatedDelivery": "2024-01-15T10:00:00.000Z"
    },
    "deliveryAgent": {
      "user": {
        "name": "John Doe",
        "phone": "+1234567890"
      }
    }
  }
}
```

### Real-time Events

The system emits real-time events for:

- **Order Status Changes**: When orders move through different stages
- **Delivery Updates**: When delivery agents accept, pick up, or deliver orders
- **Location Updates**: Real-time delivery agent location tracking
- **Payment Updates**: Payment success/failure notifications
- **Notifications**: In-app notifications and alerts

### Client Example

```javascript
import io from 'socket.io-client';

// Connect with authentication
const socket = io('ws://localhost:3000', {
  auth: { token: localStorage.getItem('token') }
});

// Handle connection
socket.on('connect', () => {
  console.log('Connected to WebSocket server');

  // Subscribe to order tracking
  socket.emit('subscribe-order-tracking', orderId);
});

// Handle order updates
socket.on('order-update', (update) => {
  // Update UI with real-time data
  updateOrderStatus(update);
});

// Handle delivery location updates
socket.on('delivery-location-update', (locationData) => {
  // Update map with delivery agent location
  updateDeliveryLocation(locationData);
});

// Handle notifications
socket.on('notification', (notification) => {
  // Show in-app notification
  showNotification(notification);
});

// Handle errors
socket.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Cleanup on component unmount
return () => {
  socket.emit('unsubscribe-order-tracking', orderId);
  socket.disconnect();
};
```

## Testing WebSocket Integration

A test HTML file is included for testing WebSocket functionality:

1. Open `websocket-test.html` in your browser
2. Enter a valid JWT token (or use "test-token" for basic connection testing)
3. Click "Connect" to establish WebSocket connection
4. Subscribe to order tracking by entering an order ID
5. Test real-time updates by triggering order status changes through the API

### WebSocket Events Summary

- **Connection**: Authenticated WebSocket connections with JWT
- **Order Tracking**: Room-based subscriptions for specific orders
- **Real-time Updates**: Instant notifications for order status, delivery, and location changes
- **Delivery Agent Features**: Location updates and tracking
- **Error Handling**: Comprehensive error handling and connection management

## Architecture Overview

The system combines multiple real-time technologies:

1. **WebSocket (Socket.io)**: Real-time client-server communication
2. **Kafka**: Event streaming and decoupling of services
3. **MongoDB**: Persistent data storage
4. **Redis**: Caching and session management (optional)

### Event Flow

1. **API Action** → **Kafka Event Published** → **Event Consumer** → **WebSocket Broadcast**
2. **Client Subscription** → **Room-based Messaging** → **Real-time Updates**

This architecture ensures scalable, real-time communication across all components of the shopping platform.

## Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT tokens
- **Payments**: Stripe API
- **Email**: Nodemailer with Gmail SMTP
- **File Uploads**: Multer
- **Real-time**: Socket.io
- **Caching**: Redis
- **Event Streaming**: Apache Kafka
- **Documentation**: Swagger/OpenAPI

## Installation

1. Clone the repository
```bash
git clone <repository-url>
cd shopping_node_backend
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Start MongoDB and Redis services

5. Start Kafka (if using local Kafka)
```bash
# Start Zookeeper
bin/zookeeper-server-start.sh config/zookeeper.properties

# Start Kafka server
bin/kafka-server-start.sh config/server.properties

# Create topics (optional, auto-created by Kafka)
bin/kafka-topics.sh --create --topic order-events --bootstrap-server localhost:9092
bin/kafka-topics.sh --create --topic delivery-tracking --bootstrap-server localhost:9092
bin/kafka-topics.sh --create --topic notifications --bootstrap-server localhost:9092
bin/kafka-topics.sh --create --topic inventory-updates --bootstrap-server localhost:9092
bin/kafka-topics.sh --create --topic analytics --bootstrap-server localhost:9092
bin/kafka-topics.sh --create --topic payment-events --bootstrap-server localhost:9092
```

6. Start the server
```bash
npm start
# or for development
npm run dev
```

## Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/grocery

# JWT
JWT_SECRET=your_jwt_secret
JWT_EXPIRE=7d

# Stripe
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_PUBLIC_KEY=your_stripe_public_key

# Email
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Kafka
KAFKA_BROKER=localhost:9092

# Redis
REDIS_URL=redis://localhost:6379
```

## Kafka Topics

The application uses the following Kafka topics for event streaming:

- `order-events`: Order lifecycle events (creation, status updates, delivery)
- `delivery-tracking`: Real-time delivery status updates
- `notifications`: Notification events for users
- `inventory-updates`: Product stock and inventory changes
- `analytics`: Business analytics and reporting data
- `payment-events`: Payment processing events

## API Documentation

Once the server is running, visit `http://localhost:3000/api-docs` for interactive API documentation.

## Key Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/send-otp` - Send OTP for verification
- `POST /api/auth/verify-otp` - Verify OTP
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Products
- `GET /api/products` - Get all products with filtering
- `GET /api/products/:id` - Get product details
- `GET /api/products/search` - Search products
- `GET /api/products/filter` - Filter products
- `GET /api/products/:productId/reviews` - Get product reviews
- `POST /api/products/:productId/reviews` - Add product review

### Cart
- `GET /api/cart` - Get user's cart
- `POST /api/cart/items` - Add item to cart
- `PUT /api/cart/items/:itemId` - Update cart item
- `DELETE /api/cart/items/:itemId` - Remove item from cart
- `POST /api/cart/apply-coupon` - Apply coupon to cart

### Orders
- `POST /api/orders` - Create new order
- `GET /api/orders` - Get user's orders
- `GET /api/orders/:orderId` - Get order details
- `PUT /api/orders/:orderId/cancel` - Cancel order
- `GET /api/orders/:orderId/track` - Track order delivery

### Payments
- `POST /api/payments/create-order` - Create payment intent
- `POST /api/payments/verify` - Verify payment completion
- `GET /api/payments/methods` - Get available payment methods

### Delivery
- `POST /api/delivery/login` - Delivery partner login
- `GET /api/delivery/orders` - Get assigned orders
- `PUT /api/delivery/orders/:orderId/accept` - Accept delivery order
- `PUT /api/delivery/orders/:orderId/picked` - Mark order as picked up
- `PUT /api/delivery/orders/:orderId/delivered` - Mark order as delivered

### Admin
- `POST /api/admin/login` - Admin login
- `GET /api/admin/analytics` - Get business analytics
- `GET /api/admin/orders` - Get all orders (admin)
- `GET /api/admin/users` - Get all users (admin)
- `GET /api/admin/products` - Get all products (admin)

## Event Flow Examples

### Order Creation Flow
1. User places order → `order-events` (ORDER_CREATED)
2. Inventory updated → `inventory-updates` (STOCK_DECREASED)
3. User notified → `notifications` (NOTIFICATION_CREATED)
4. Payment processed → `payment-events` (PAYMENT_SUCCESS)
5. Order status updated → `order-events` (ORDER_STATUS_UPDATED)

### Delivery Flow
1. Delivery agent accepts order → `delivery-tracking` (ORDER_ACCEPTED)
2. Order picked up → `delivery-tracking` (ORDER_PICKED_UP)
3. Order delivered → `delivery-tracking` (ORDER_DELIVERED)
4. User notified → `notifications` (NOTIFICATION_CREATED)

## Development

### Project Structure
```
├── config/
│   └── kafka.js              # Kafka configuration
├── controllers/              # Route handlers
├── middleware/               # Custom middleware
├── models/                   # MongoDB models
├── routes/                   # API routes
├── services/
│   └── eventConsumer.js      # Kafka event consumer
├── utils/                    # Utility functions
├── index.js                  # Application entry point
└── package.json
```

### Adding New Events

1. Define event types in `config/kafka.js`
2. Publish events using `publishEvent(topic, eventData)`
3. Add event handlers in `services/eventConsumer.js`

### Testing Kafka Integration

```bash
# Check Kafka topics
bin/kafka-console-consumer.sh --topic order-events --bootstrap-server localhost:9092 --from-beginning

# Monitor consumer logs
tail -f logs/kafka-consumer.log
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.