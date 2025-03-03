const express = require('express');
const router = express.Router();
const insightsController = require('../controllers/insightsController');
const { authenticate } = require('../middlewares/auth');

// Apply authentication middleware to all insights routes
router.use(authenticate);

// Generate insights from user data
router.get('/generate', insightsController.generateInsights);

// Get analytics data for dashboard
router.get('/analytics', insightsController.getAnalytics);

module.exports = router;