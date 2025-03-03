const express = require('express');
const router = express.Router();
const logController = require('../controllers/logController');
const { authenticate } = require('../middlewares/auth');

// Apply authentication middleware to all log routes
router.use(authenticate);

// Get all logs
router.get('/', logController.getLogs);

// Create a new log
router.post('/', logController.createLog);

// Get a log by ID
router.get('/:id', logController.getLog);

// Update a log
router.put('/:id', logController.updateLog);

// Delete a log
router.delete('/:id', logController.deleteLog);

module.exports = router;