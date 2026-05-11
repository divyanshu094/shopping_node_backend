const Banner = require('../models/Banner');
const Offer = require('../models/Offer');
const Category = require('../models/Category');
const Product = require('../models/Product');

exports.getHome = async (req, res) => {
  try {
    const [banners, offers, categories, featuredProducts, trendingProducts, recommendedProducts] = await Promise.all([
      Banner.find({ isActive: true }).sort('sortOrder'),
      Offer.find({ isActive: true, endDate: { $gte: new Date() } }),
      Category.find({ isActive: true }).sort('sortOrder').limit(8),
      Product.find({ isFeatured: true, isActive: true }).limit(10),
      Product.find({ isActive: true }).sort({ soldCount: -1 }).limit(10),
      Product.find({ isActive: true }).sort({ rating: -1 }).limit(10)
    ]);

    res.json({
      success: true,
      banners,
      offers,
      categories,
      featuredProducts,
      trendingProducts,
      recommendedProducts
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true }).sort('sortOrder');
    res.json({ success: true, banners });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ isActive: true, endDate: { $gte: new Date() } });
    res.json({ success: true, offers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort('sortOrder');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getFeaturedProducts = async (req, res) => {
  try {
    const products = await Product.find({ isFeatured: true, isActive: true }).populate('category');
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getTrendingProducts = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .sort({ soldCount: -1 })
      .populate('category');
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getRecommendedProducts = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .sort({ rating: -1 })
      .populate('category');
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};