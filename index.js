require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Define Swagger configuration options
const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'Node.js API', version: '1.0.0' },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  apis: ['./routes/*.js'], // Path to API files for JSDoc comments
};

const specs = swaggerJsdoc(options);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/grocery')
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

// Initialize Kafka
// const { initKafka, consumeEvents } = require('./config/kafka');
// const { startEventConsumer } = require('./services/eventConsumer');

// initKafka().then(() => {
//   console.log('Kafka initialized successfully');

//   // Start event consumer
//   startEventConsumer().then(() => {
//     console.log('Event consumer started successfully');
//   }).catch((err) => {
//     console.error('Event consumer failed to start:', err);
//   });
// }).catch((err) => {
//   console.error('Kafka initialization failed:', err);
//   // Don't exit process, continue with server startup
// });

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const productRoutes = require('./routes/product');
app.use('/api/products', productRoutes);

const cartRoutes = require('./routes/cart');
app.use('/api/cart', cartRoutes);
const orderRoutes = require('./routes/order');
app.use('/api/orders', orderRoutes);

const addressRoutes = require('./routes/address');
app.use('/api/addresses', addressRoutes);

const locationRoutes = require('./routes/location');
app.use('/api/location', locationRoutes);

const homeRoutes = require('./routes/home');
app.use('/api/home', homeRoutes);

const categoryRoutes = require('./routes/category');
app.use('/api/categories', categoryRoutes);

const paymentRoutes = require('./routes/payment');
app.use('/api/payments', paymentRoutes);

const notificationRoutes = require('./routes/notification');
app.use('/api/notifications', notificationRoutes);

const deliveryRoutes = require('./routes/delivery');
app.use('/api/delivery', deliveryRoutes);

const adminRoutes = require('./routes/admin');
app.use('/api/admin', adminRoutes);

// Socket.io middleware for authentication
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    socket.userId = decoded.userId;
    socket.isDeliveryPartner = decoded.isDeliveryPartner;
    socket.isAdmin = decoded.isAdmin;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// Initialize Socket.io service
require('./services/socketService')(io);

app.get('/', (req, res) => {
  res.send('Grocery Delivery API is running');
});

server.listen(PORT,  '0.0.0.0',() => {
  console.log(`Server running on port ${PORT}`);
}); 