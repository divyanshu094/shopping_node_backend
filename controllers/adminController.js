const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const DeliveryAgent = require('../models/DeliveryAgent');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { publishEvent, TOPICS } = require('../config/kafka');

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email, isAdmin: true });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user._id, isAdmin: true },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user._id, name: user.name, email: user.email, isAdmin: true } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, user, startDate, endDate } = req.query;
    const query = {};

    if (status) query.status = status;
    if (user) query.user = user;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const orders = await Order.find(query)
      .populate(['user', 'items.product', 'deliveryAgent'])
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Order.countDocuments(query);

    // Calculate totals
    const totalRevenue = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    res.json({
      orders,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total,
      totalRevenue: totalRevenue[0]?.total || 0
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isVerified } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (isVerified !== undefined) query.isVerified = isVerified === 'true';

    const users = await User.find(query)
      .select('-password -otp -resetToken')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getProducts = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, search, isActive } = req.query;
    const query = {};

    if (category) query.category = category;
    if (search) query.$text = { $search: search };
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const products = await Product.find(query)
      .populate('category')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(query);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const product = new Product(req.body);
    await product.save();
    await product.populate('category');
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.productId, req.body, { new: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    await product.populate('category');
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.productId, { isActive: false });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const category = new (require('../models/Category'))(req.body);
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const category = await require('../models/Category').findByIdAndUpdate(req.params.categoryId, req.body, { new: true });
    if (!category) return res.status(404).json({ message: 'Category not found' });
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    startDate.setDate(endDate.getDate() - days);

    // Get analytics data
    const [
      totalOrders,
      totalRevenue,
      totalUsers,
      totalProducts,
      recentOrders,
      topProducts
    ] = await Promise.all([
      Order.countDocuments({ createdAt: { $gte: startDate } }),
      Order.aggregate([
        { $match: { status: 'delivered', createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      User.countDocuments({ createdAt: { $gte: startDate } }),
      Product.countDocuments({ isActive: true }),
      Order.find({ createdAt: { $gte: startDate } }).limit(10).populate('user'),
      Product.find({ isActive: true }).sort({ soldCount: -1 }).limit(10)
    ]);

    res.json({
      period,
      totalOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      totalUsers,
      totalProducts,
      recentOrders,
      topProducts
    });

    // Publish analytics data event
    await publishEvent(TOPICS.ANALYTICS, {
      eventType: 'ANALYTICS_DATA_REQUESTED',
      period,
      data: {
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        totalUsers,
        totalProducts,
        startDate,
        endDate
      },
      requestedBy: req.user.userId
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getDeliveryAgents = async (req, res) => {
  try {
    const deliveryAgents = await DeliveryAgent.find()
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 });

    res.json(deliveryAgents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};