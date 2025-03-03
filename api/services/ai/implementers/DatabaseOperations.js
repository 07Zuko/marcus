/**
 * Database Operations
 * 
 * Provides database CRUD operations for AI agents
 * with proper validation and error handling
 */

const Goal = require('../../../models/Goal');
const Task = require('../../../models/Task');
const User = require('../../../models/User');

class DatabaseOperations {
  constructor() {
    console.log('Database Operations service initialized');
  }
  
  /**
   * Get all goals for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - List of goals
   */
  async getUserGoals(userId) {
    try {
      // Handle direct chat user case
      if (userId === 'direct_chat_user') {
        const directChatUserId = await User.createDirectChatUser();
        if (directChatUserId) {
          userId = directChatUserId;
        } else {
          return [];
        }
      }
      
      // Find all goals for user
      const goals = await Goal.find({ 
        user: userId 
      }).sort({ 
        createdAt: -1 
      });
      
      return goals;
    } catch (error) {
      console.error('Error fetching user goals:', error);
      return [];
    }
  }
  
  /**
   * Get all active tasks for a user
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - List of tasks
   */
  async getUserTasks(userId) {
    try {
      // Handle direct chat user case
      if (userId === 'direct_chat_user') {
        const directChatUserId = await User.createDirectChatUser();
        if (directChatUserId) {
          userId = directChatUserId;
        } else {
          return [];
        }
      }
      
      // Find all active tasks for user
      const tasks = await Task.find({ 
        user: userId,
        completed: false
      }).sort({ 
        dueDate: 1 
      });
      
      return tasks;
    } catch (error) {
      console.error('Error fetching user tasks:', error);
      return [];
    }
  }
  
  /**
   * Save a new goal to the database
   * @param {Object} goalData - Goal data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Operation result
   */
  async saveGoal(goalData, userId) {
    try {
      console.log('Saving goal:', goalData);
      
      // Handle direct chat user case
      if (userId === 'direct_chat_user') {
        const directChatUserId = await User.createDirectChatUser();
        if (directChatUserId) {
          userId = directChatUserId;
        } else {
          return { success: false, error: 'Failed to create user for goal' };
        }
      }
      
      // Validate goal data
      if (!goalData.title) {
        return { success: false, error: 'Goal title is required' };
      }
      
      // Default values
      const deadline = goalData.deadline ? 
        new Date(goalData.deadline) : 
        new Date(new Date().setMonth(new Date().getMonth() + 3)); // Default 3 months
      
      // Ensure a valid category is used
      let category = 'other';
      if (goalData.category) {
        if (['career', 'health', 'personal', 'financial', 'other'].includes(
          goalData.category.toLowerCase())) {
          category = goalData.category.toLowerCase();
        } else if (goalData.category.toLowerCase() === 'fitness') {
          category = 'health'; // Map fitness to health
        }
      }
      
      // Create new goal
      const goal = new Goal({
        user: userId,
        title: goalData.title,
        description: goalData.description || '',
        category: category,
        priority: goalData.priority || 'medium',
        status: goalData.status || 'in progress',
        deadline: deadline
      });
      
      // Save goal
      await goal.save();
      console.log('Goal saved successfully:', goal._id);
      
      return { 
        success: true, 
        goal: {
          id: goal._id,
          title: goal.title,
          category: goal.category,
          deadline: goal.deadline
        }
      };
    } catch (error) {
      console.error('Error saving goal:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Save a new task to the database
   * @param {Object} taskData - Task data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Operation result
   */
  async saveTask(taskData, userId) {
    try {
      console.log('Saving task:', taskData);
      
      // Handle direct chat user case
      if (userId === 'direct_chat_user') {
        const directChatUserId = await User.createDirectChatUser();
        if (directChatUserId) {
          userId = directChatUserId;
        } else {
          return { success: false, error: 'Failed to create user for task' };
        }
      }
      
      // Validate task data
      if (!taskData.title) {
        return { success: false, error: 'Task title is required' };
      }
      
      // Default values
      const dueDate = taskData.dueDate ? 
        new Date(taskData.dueDate) : 
        new Date(new Date().setDate(new Date().getDate() + 7)); // Default 1 week
      
      // Create new task
      const task = new Task({
        user: userId,
        goal: taskData.goalId || undefined,
        title: taskData.title,
        description: taskData.description || '',
        priority: taskData.priority || 'medium',
        dueDate: dueDate,
        tags: taskData.tags || [],
        completed: false,
        aiSuggested: true
      });
      
      // Save task
      await task.save();
      console.log('Task saved successfully:', task._id);
      
      // If this task is linked to a goal, update the goal
      if (taskData.goalId) {
        const goal = await Goal.findById(taskData.goalId);
        if (goal && goal.user.toString() === userId.toString()) {
          goal.tasks.push(task._id);
          await goal.save();
          await goal.updateProgress();
        }
      }
      
      return { 
        success: true, 
        task: {
          id: task._id,
          title: task.title,
          dueDate: task.dueDate,
          priority: task.priority
        }
      };
    } catch (error) {
      console.error('Error saving task:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Update an existing goal
   * @param {string} goalId - Goal ID
   * @param {Object} updates - Fields to update
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Operation result
   */
  async updateGoal(goalId, updates, userId) {
    try {
      // Find goal and ensure it belongs to user
      const goal = await Goal.findOne({
        _id: goalId,
        user: userId
      });
      
      if (!goal) {
        return { success: false, error: 'Goal not found or not owned by user' };
      }
      
      // Apply updates
      Object.keys(updates).forEach(key => {
        // Handle special case for category
        if (key === 'category') {
          if (updates[key] === 'fitness') {
            goal[key] = 'health';
          } else if (['career', 'health', 'personal', 'financial', 'other'].includes(updates[key])) {
            goal[key] = updates[key];
          }
        } else if (key === 'deadline') {
          goal[key] = new Date(updates[key]);
        } else if (key !== '_id' && key !== 'user') {
          goal[key] = updates[key];
        }
      });
      
      // Save changes
      await goal.save();
      
      return { success: true, goal };
    } catch (error) {
      console.error('Error updating goal:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Update an existing task
   * @param {string} taskId - Task ID
   * @param {Object} updates - Fields to update
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Operation result
   */
  async updateTask(taskId, updates, userId) {
    try {
      // Find task and ensure it belongs to user
      const task = await Task.findOne({
        _id: taskId,
        user: userId
      });
      
      if (!task) {
        return { success: false, error: 'Task not found or not owned by user' };
      }
      
      // Apply updates
      Object.keys(updates).forEach(key => {
        if (key === 'dueDate') {
          task[key] = new Date(updates[key]);
        } else if (key === 'completed' && updates[key] === true) {
          task[key] = true;
          task.completedAt = new Date();
        } else if (key !== '_id' && key !== 'user') {
          task[key] = updates[key];
        }
      });
      
      // Save changes
      await task.save();
      
      // If this is linked to a goal, update the goal's progress
      if (task.goal) {
        const goal = await Goal.findById(task.goal);
        if (goal) {
          await goal.updateProgress();
        }
      }
      
      return { success: true, task };
    } catch (error) {
      console.error('Error updating task:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = DatabaseOperations;