const express = require('express');
const router = express.Router();
const goalController = require('../controllers/goalController');
const { authenticate } = require('../middlewares/auth');

// Apply authentication middleware to all goals routes
router.use(authenticate);

// Get all goals
router.get('/', goalController.getGoals);

// Create a new goal
router.post('/', goalController.createGoal);

// Get a goal by ID
router.get('/:id', goalController.getGoal);

// Update a goal
router.put('/:id', goalController.updateGoal);

// Delete a goal
router.delete('/:id', goalController.deleteGoal);

// Get AI analysis for a goal
router.get('/:id/analysis', goalController.getGoalAnalysis);

module.exports = router;