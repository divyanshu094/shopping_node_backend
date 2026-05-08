require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cors = require('cors');

const app = express();
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
// , {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
// }
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/grocery')
.then(() => console.log('MongoDB connected'))
.catch((err) => console.error('MongoDB connection error:', err));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const productRoutes = require('./routes/product');
app.use('/api/products', productRoutes);

const cartRoutes = require('./routes/cart');
app.use('/api/cart', cartRoutes);
const orderRoutes = require('./routes/order');
app.use('/api/orders', orderRoutes);

app.get('/', (req, res) => {
  res.send('Grocery Delivery API is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 