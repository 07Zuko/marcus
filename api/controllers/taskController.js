const Task = require('../models/Task');
const Goal = require('../models/Goal');
const pineconeService = require('../services/pineconeService');

/**
 * Get all tasks for a user
 */
exports.getTasks = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Extract query parameters
    const { 
      completed, 
      goalId, 
      priority, 
      sort = 'dueDate',
      tag
    } = req.query;
    
    // Build query
    const query = { user: userId };
    
    // Add filters if provided
    if (completed !== undefined) query.completed = completed === 'true';
    if (goalId) query.goal = goalId;
    if (priority) query.priority = priority;
    if (tag) query.tags = tag;
    
    // Sort direction
    const sortDir = sort.startsWith('-') ? -1 : 1;
    const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
    
    // Find tasks for this user with filters
    const tasks = await Task.find(query)
      .sort({ [sortField]: sortDir })
      .populate('goal', 'title category');
    
    res.json({
      success: true,
      tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching tasks',
      error: error.message
    });
  }
};

/**
 * Get a single task by ID
 */
exports.getTask = async (req, res) => {
  try {
    const userId = req.user._id;
    const taskId = req.params.id;
    
    // Find the task
    const task = await Task.findOne({
      _id: taskId,
      user: userId
    }).populate('goal', 'title category');
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    res.json({
      success: true,
      task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching task',
      error: error.message
    });
  }
};

/**
 * Create a new task
 */
exports.createTask = async (req, res) => {
  try {
    const userId = req.user._id;
    const { 
      title, 
      description, 
      priority, 
      dueDate, 
      goalId, 
      tags,
      estimatedDuration
    } = req.body;
    
    // Create a new task
    const task = new Task({
      user: userId,
      title,
      description,
      priority,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      goal: goalId,
      tags: tags || [],
      estimatedDuration
    });
    
    // Save the task
    await task.save();
    
    // If associated with a goal, add this task to the goal's tasks array
    if (goalId) {
      const goal = await Goal.findById(goalId);
      if (goal && goal.user.toString() === userId.toString()) {
        goal.tasks.push(task._id);
        await goal.save();
      }
    }
    
    // Store in Pinecone for memory
    await pineconeService.storeMemory({
      id: `task-${task._id}`,
      type: 'task',
      text: `Task: ${title} - ${description || ''}`,
      metadata: {
        taskId: task._id,
        goalId: task.goal,
        priority,
        dueDate: task.dueDate
      }
    }, userId);
    
    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating task',
      error: error.message
    });
  }
};

/**
 * Update a task
 */
exports.updateTask = async (req, res) => {
  try {
    const userId = req.user._id;
    const taskId = req.params.id;
    const updates = req.body;
    
    // Find the task
    const task = await Task.findOne({
      _id: taskId,
      user: userId
    });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // Handle goal change
    if (updates.goalId !== undefined) {
      // If removing from a goal
      if (task.goal && (!updates.goalId || updates.goalId !== task.goal.toString())) {
        const oldGoal = await Goal.findById(task.goal);
        if (oldGoal) {
          oldGoal.tasks = oldGoal.tasks.filter(t => t.toString() !== taskId.toString());
          await oldGoal.save();
          await oldGoal.updateProgress();
        }
      }
      
      // If adding to a goal
      if (updates.goalId) {
        const newGoal = await Goal.findById(updates.goalId);
        if (newGoal && newGoal.user.toString() === userId.toString()) {
          // Only add if not already in the goal
          if (!newGoal.tasks.includes(taskId)) {
            newGoal.tasks.push(taskId);
            await newGoal.save();
          }
        }
      }
      
      // Update the task's goal
      task.goal = updates.goalId || null;
    }
    
    // Update allowed fields
    const allowedUpdates = [
      'title', 'description', 'priority', 'dueDate', 
      'completed', 'tags', 'estimatedDuration'
    ];
    
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        task[field] = updates[field];
      }
    });
    
    // Convert dueDate string to Date if provided
    if (updates.dueDate) {
      task.dueDate = new Date(updates.dueDate);
    }
    
    // Update completedAt if task is completed
    if (updates.completed === true && !task.completedAt) {
      task.completedAt = new Date();
    } else if (updates.completed === false) {
      task.completedAt = null;
    }
    
    // Update Pinecone memory
    await pineconeService.storeMemory({
      id: `task-${task._id}`,
      type: 'task',
      text: `Task: ${task.title} - ${task.description || ''}`,
      metadata: {
        taskId: task._id,
        goalId: task.goal,
        priority: task.priority,
        dueDate: task.dueDate,
        completed: task.completed
      }
    }, userId);
    
    // Save the task
    await task.save();
    
    res.json({
      success: true,
      message: 'Task updated successfully',
      task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating task',
      error: error.message
    });
  }
};

/**
 * Delete a task
 */
exports.deleteTask = async (req, res) => {
  try {
    const userId = req.user._id;
    const taskId = req.params.id;
    
    // Find and delete the task
    const task = await Task.findOneAndDelete({
      _id: taskId,
      user: userId
    });
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }
    
    // If task was associated with a goal, update goal
    if (task.goal) {
      const goal = await Goal.findById(task.goal);
      if (goal) {
        goal.tasks = goal.tasks.filter(t => t.toString() !== taskId.toString());
        await goal.save();
        await goal.updateProgress();
      }
    }
    
    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting task',
      error: error.message
    });
  }
};