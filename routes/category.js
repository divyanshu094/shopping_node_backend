const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get all categories
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: List of categories
 */
router.get('/', categoryController.getCategories);

/**
 * @swagger
 * /api/categories/{categoryId}:
 *   get:
 *     summary: Get category by ID
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Category details
 *       404:
 *         description: Category not found
 */
router.get('/:categoryId', categoryController.getCategoryById);

/**
 * @swagger
 * /api/categories/{categoryId}/products:
 *   get:
 *     summary: Get products in a category
 *     tags: [Categories]
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
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
 *         name: sort
 *         schema:
 *           type: string
 *           default: name
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: asc
 *     responses:
 *       200:
 *         description: Products in category
 */
router.get('/:categoryId/products', categoryController.getCategoryProducts);

/**
 * @swagger
 * /api/admin/categories:
 *   post:
 *     summary: Create a new category (Admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *               parent:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               sortOrder:
 *                 type: number
 *     responses:
 *       201:
 *         description: Category created successfully
 *       403:
 *         description: Admin access required
 */
router.post('/admin/categories', auth, admin, categoryController.createCategory);

/**
 * @swagger
 * /api/admin/categories/{categoryId}:
 *   put:
 *     summary: Update category (Admin)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               image:
 *                 type: string
 *               parent:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               sortOrder:
 *                 type: number
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       403:
 *         description: Admin access required
 *       404:
 *         description: Category not found
 */
router.put('/admin/categories/:categoryId', auth, admin, categoryController.updateCategory);

module.exports = router;