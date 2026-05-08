const express = require('express');
const router = express.Router();
const homeController = require('../controllers/homeController');

/**
 * @swagger
 * /api/home:
 *   get:
 *     summary: Get home page data
 *     tags: [Home]
 *     responses:
 *       200:
 *         description: Home page data including banners, offers, categories, and products
 */
router.get('/', homeController.getHome);

/**
 * @swagger
 * /api/banners:
 *   get:
 *     summary: Get active banners
 *     tags: [Home]
 *     responses:
 *       200:
 *         description: List of active banners
 */
router.get('/banners', homeController.getBanners);

/**
 * @swagger
 * /api/offers:
 *   get:
 *     summary: Get active offers
 *     tags: [Home]
 *     responses:
 *       200:
 *         description: List of active offers
 */
router.get('/offers', homeController.getOffers);

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get active categories
 *     tags: [Home]
 *     responses:
 *       200:
 *         description: List of active categories
 */
router.get('/categories', homeController.getCategories);

/**
 * @swagger
 * /api/featured-products:
 *   get:
 *     summary: Get featured products
 *     tags: [Home]
 *     responses:
 *       200:
 *         description: List of featured products
 */
router.get('/featured-products', homeController.getFeaturedProducts);

/**
 * @swagger
 * /api/trending-products:
 *   get:
 *     summary: Get trending products
 *     tags: [Home]
 *     responses:
 *       200:
 *         description: List of trending products
 */
router.get('/trending-products', homeController.getTrendingProducts);

/**
 * @swagger
 * /api/recommended-products:
 *   get:
 *     summary: Get recommended products
 *     tags: [Home]
 *     responses:
 *       200:
 *         description: List of recommended products
 */
router.get('/recommended-products', homeController.getRecommendedProducts);

module.exports = router;