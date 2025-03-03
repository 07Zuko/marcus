const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticate } = require('../middlewares/auth');

// Apply authentication middleware to all task routes
router.use(authenticate);

// Get all tasks
router.get('/', taskController.getTasks);

// Create a new task
router.post('/', taskController.createTask);

// Get a task by ID
router.get('/:id', taskController.getTask);

// Update a task
router.put('/:id', taskController.updateTask);

// Delete a task
router.delete('/:id', taskController.deleteTask);

module.exports = router;