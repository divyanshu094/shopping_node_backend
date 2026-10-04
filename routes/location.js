const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const auth = require('../middleware/auth');

/**
 * @swagger
 * /api/location/check-serviceability:
 *   post:
 *     summary: Check if location is serviceable
 *     tags: [Location]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               pincode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Serviceability check result
 */
router.post('/check-serviceability', locationController.checkServiceability);

/**
 * @swagger
 * /api/location/current:
 *   get:
 *     summary: Get current location
 *     tags: [Location]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current location data
 */
router.get('/current', auth, locationController.getCurrentLocation);

/**
 * @swagger
 * /api/stores/nearby:
 *   get:
 *     summary: Get nearby stores
 *     tags: [Location]
 *     parameters:
 *       - in: query
 *         name: latitude
 *         schema:
 *           type: number
 *       - in: query
 *         name: longitude
 *         schema:
 *           type: number
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           default: 10
 *     responses:
 *       200:
 *         description: List of nearby stores
 */
router.get('/stores/nearby', locationController.getNearbyStores);

module.exports = router;