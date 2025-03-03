/**
 * Claude Code Implementer
 * 
 * Uses Claude AI to handle technical implementation tasks, including:
 * - Database operations
 * - Schema validation
 * - Code generation
 * - Complex goal and task implementations
 */

const axios = require('axios');
const config = require('../../../config');
const Goal = require('../../../models/Goal');
const Task = require('../../../models/Task');
const User = require('../../../models/User');

class ClaudeCodeImplementer {
  constructor() {
    // Try to get the Claude API key with clear error handling
    try {
      this.apiKey = config.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY;
      
      // Handle common cases of missing or invalid keys
      if (!this.apiKey || 
          this.apiKey === 'your-claude-api-key-here' || 
          this.apiKey === 'sk-placeholder') {
        console.log("No valid Claude API key found - using direct database operations instead");
        this.apiKey = null;
      } else {
        console.log("Claude Code Implementer initialized with API key:", this.apiKey ? "Present" : "Missing");
      }
    } catch (error) {
      console.log("Error accessing Claude API key:", error.message);
      this.apiKey = null;
    }
    
    // System prompt for Claude when performing implementations
    this.systemPrompt = `
      You are Marcus's Implementation Assistant, a specialized AI focused on technical implementation tasks.
      
      Your main responsibilities:
      1. Write and execute code for database operations
      2. Validate data before saving
      3. Format objects correctly for database schemas
      4. Handle technical implementation of goals and tasks
      
      Available database models:
      - Goal: user, title, description, category, priority, status, deadline
      - Task: user, goal, title, description, priority, dueDate, completed
      - User: _id, name, email, preferences
      
      IMPORTANT CONSTRAINTS:
      - Only perform operations explicitly requested
      - Never expose sensitive data
      - Validate inputs properly
      - Return clear success/error responses
      
      When writing code, focus on:
      - Correctness and safety
      - Proper error handling
      - Following MongoDB best practices
    `;
  }
  
  /**
   * Execute an implementation action using Claude
   * @param {string} action - Action to perform
   * @param {Object} data - Data for the action
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Result of implementation
   */
  async execute(action, data, userId) {
    console.log(`Executing implementation: ${action} (userId: ${userId})`);
    
    // Early validation
    if (!userId) {
      console.error('ERROR: Missing userId in execute() call');
    }
    
    if (action === 'saveGoal' && (!data || !data.goal)) {
      console.error('ERROR: Missing goal data in saveGoal action');
      return { success: false, error: 'Missing goal data' };
    }
    
    try {
      // If Claude API key isn't available, go directly to fallback
      if (!this.apiKey) {
        console.log('No Claude API key available, using fallback implementation directly');
        return this.fallbackImplementation(action, data, userId);
      }
      
      // Create task-specific prompt based on action
      let actionPrompt = '';
      
      switch (action) {
        case 'saveGoal':
          actionPrompt = this.createSaveGoalPrompt(data.goal, userId);
          break;
        case 'saveTask':
          actionPrompt = this.createSaveTaskPrompt(data.task, userId);
          break;
        case 'updateGoal':
          actionPrompt = this.createUpdateGoalPrompt(data.goalId, data.updates, userId);
          break;
        case 'updateTask':
          actionPrompt = this.createUpdateTaskPrompt(data.taskId, data.updates, userId);
          break;
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
      
      try {
        // Call Claude to implement the action
        console.log(`Calling Claude API for action: ${action}`);
        const claudeResponse = await this.callClaudeForImplementation(actionPrompt);
        
        // Execute the code from Claude's response
        console.log(`Executing Claude-generated code for action: ${action}`);
        const result = await this.executeCodeFromResponse(claudeResponse, action, data, userId);
        
        return result;
      } catch (claudeError) {
        console.error('Claude implementation failed, using fallback implementation:', claudeError);
        return this.fallbackImplementation(action, data, userId);
      }
    } catch (error) {
      console.error('Implementation error:', error);
      // Always fall back to direct implementation on any error
      return this.fallbackImplementation(action, data, userId);
    }
  }
  
  /**
   * Create prompt for saving a goal
   * @param {Object} goal - Goal data
   * @param {string} userId - User ID
   * @returns {string} - Formatted prompt
   */
  createSaveGoalPrompt(goal, userId) {
    return `
      Create and save a new goal to the database with these details:
      
      Goal Information:
      ${Object.entries(goal)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')}
      
      User ID: ${userId}
      
      Write JavaScript code to:
      1. Handle the case where userId is 'direct_chat_user' by calling User.createDirectChatUser()
      2. Create a new Goal object using the provided data
      3. Ensure the category is valid (fitness→health)
      4. Save it to the database
      5. Return a success response with the created goal
      
      Valid categories are: health, career, personal, financial, other
      
      Return your implementation code within <code></code> tags.
      After the code, explain what you implemented.
    `;
  }
  
  /**
   * Create prompt for saving a task
   * @param {Object} task - Task data
   * @param {string} userId - User ID
   * @returns {string} - Formatted prompt
   */
  createSaveTaskPrompt(task, userId) {
    return `
      Create and save a new task to the database with these details:
      
      Task Information:
      ${Object.entries(task)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')}
      
      User ID: ${userId}
      
      Write JavaScript code to:
      1. Handle the case where userId is 'direct_chat_user'
      2. Create a new Task object using the provided data
      3. Save it to the database
      4. If linked to a goal, update the goal's task list
      5. Return a success response with the created task
      
      Return your implementation code within <code></code> tags.
      After the code, explain what you implemented.
    `;
  }
  
  /**
   * Create prompt for updating a goal
   * @param {string} goalId - Goal ID
   * @param {Object} updates - Update data
   * @param {string} userId - User ID
   * @returns {string} - Formatted prompt
   */
  createUpdateGoalPrompt(goalId, updates, userId) {
    return `
      Update an existing goal with these changes:
      
      Goal ID: ${goalId}
      User ID: ${userId}
      
      Updates:
      ${Object.entries(updates)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')}
      
      Write JavaScript code to:
      1. Find the goal by ID and verify it belongs to the user
      2. Apply the updates (special handling for dates and category)
      3. Save the changes
      4. Return success or error response
      
      Valid categories are: health, career, personal, financial, other
      
      Return your implementation code within <code></code> tags.
      After the code, explain what you implemented.
    `;
  }
  
  /**
   * Create prompt for updating a task
   * @param {string} taskId - Task ID
   * @param {Object} updates - Update data
   * @param {string} userId - User ID
   * @returns {string} - Formatted prompt
   */
  createUpdateTaskPrompt(taskId, updates, userId) {
    return `
      Update an existing task with these changes:
      
      Task ID: ${taskId}
      User ID: ${userId}
      
      Updates:
      ${Object.entries(updates)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')}
      
      Write JavaScript code to:
      1. Find the task by ID and verify it belongs to the user
      2. Apply the updates (special handling for dates and completion)
      3. If the completion status is changed, set completedAt
      4. Save the changes
      5. If the task is linked to a goal, update the goal's progress
      6. Return success or error response
      
      Return your implementation code within <code></code> tags.
      After the code, explain what you implemented.
    `;
  }
  
  /**
   * Call Claude API for implementation code
   * @param {string} prompt - Implementation prompt
   * @returns {Promise<string>} - Claude response
   */
  async callClaudeForImplementation(prompt) {
    if (!this.apiKey) {
      console.warn('Claude API key not found, using mock implementation');
      return this.getMockImplementation(prompt);
    }
    
    try {
      console.log('Calling Claude API with key:', this.apiKey.substring(0, 10) + '...');
      
      // Using the latest Anthropic API format
      // Use the current Claude v1 API format
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4000,
          messages: [
            {
              role: 'system',
              content: this.systemPrompt
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-01-01'
          }
        }
      );
      
      if (response.data && response.data.content && response.data.content[0]) {
        console.log('Claude API response received successfully');
        return response.data.content[0].text;
      } else {
        console.error('Unexpected Claude API response format:', response.data);
        throw new Error('Unexpected Claude API response format');
      }
    } catch (error) {
      console.error('Error calling Claude API:', error.response?.data || error.message);
      return this.getMockImplementation(prompt);
    }
  }
  
  /**
   * Extract and execute code from Claude response
   * @param {string} response - Claude response
   * @param {string} action - Original action
   * @param {Object} data - Original data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Execution result
   */
  async executeCodeFromResponse(response, action, data, userId) {
    try {
      // Extract code from Claude response
      const codeMatch = response.match(/<code>([\s\S]*?)<\/code>/);
      
      if (!codeMatch) {
        console.warn('No code block found in Claude response');
        return this.fallbackImplementation(action, data, userId);
      }
      
      const code = codeMatch[1].trim();
      
      // Check if this is our special trigger for direct operations
      if (code.includes('directOperationRequired')) {
        console.log('Detected direct operation flag, using fallback implementation');
        return this.fallbackImplementation(action, data, userId);
      }
      
      // Create function from the code
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      
      // Create a safe execution environment with required dependencies
      const executeFunction = new AsyncFunction(
        'Goal', 'Task', 'User', 'userId', 'data', 
        `try {
          ${code}
        } catch (error) {
          console.error('Error executing implementation code:', error);
          return { success: false, error: error.message };
        }`
      );
      
      // Execute the function
      const result = await executeFunction(Goal, Task, User, userId, action === 'saveGoal' ? data.goal : (action === 'saveTask' ? data.task : data));
      
      // Check if the result indicates we should use the fallback
      if (result && (result.directOperationRequired || result.controlPassedToFallback)) {
        console.log('Code execution indicated fallback required');
        return this.fallbackImplementation(action, data, userId);
      }
      
      return result || { success: false, error: 'No result returned from implementation' };
    } catch (error) {
      console.error('Error executing Claude code:', error);
      return this.fallbackImplementation(action, data, userId);
    }
  }
  
  /**
   * Fallback implementation if Claude code execution fails
   * @param {string} action - Action to perform
   * @param {Object} data - Action data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Fallback result
   */
  async fallbackImplementation(action, data, userId) {
    console.log('Using fallback implementation for:', action);
    
    try {
      let result;
      
      // Use direct implementation based on action
      switch (action) {
        case 'saveGoal':
          result = await this.fallbackSaveGoal(data.goal, userId);
          break;
        case 'saveTask':
          result = await this.fallbackSaveTask(data.task, userId);
          break;
        case 'updateGoal':
          result = await this.fallbackUpdateGoal(data.goalId, data.updates, userId);
          break;
        case 'updateTask':
          result = await this.fallbackUpdateTask(data.taskId, data.updates, userId);
          break;
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
      
      return result;
    } catch (error) {
      console.error('Error in fallback implementation:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Fallback method for saving a goal
   * @param {Object} goalData - Goal data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Result
   */
  /**
   * Save a goal directly in the database
   * @param {Object} goalData - Goal data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Operation result
   */
  async fallbackSaveGoal(goalData, userId) {
    try {
      console.log('USING DIRECT DB IMPLEMENTATION for saveGoal');
      console.log('Goal data:', goalData);
      console.log('User ID:', userId);
      
      // Handle direct chat user - this is critical!
      let mongoUserId = userId;
      if (userId === 'direct_chat_user' || !userId) {
        try {
          const directChatUserId = await User.createDirectChatUser();
          if (directChatUserId) {
            console.log('Created/retrieved direct chat user with ID:', directChatUserId);
            mongoUserId = directChatUserId;
          } else {
            return { success: false, error: 'Failed to create user for goal' };
          }
        } catch (userError) {
          console.error('Error creating direct chat user:', userError);
          return { success: false, error: 'Failed to create user: ' + userError.message };
        }
      }
      
      // Ensure valid category
      let category = 'other';
      if (goalData.category) {
        if (['career', 'health', 'personal', 'financial', 'other'].includes(
          goalData.category.toLowerCase())) {
          category = goalData.category.toLowerCase();
        } else if (goalData.category.toLowerCase() === 'fitness') {
          category = 'health';
        }
      }
      
      // Set end of year deadline
      let deadline;
      try {
        if (goalData.deadline) {
          if (typeof goalData.deadline === 'string' && 
              (goalData.deadline.toLowerCase().includes('end of year') || 
               goalData.deadline.toLowerCase().includes('end of the year'))) {
            // Create December 31st of current year
            deadline = new Date(new Date().getFullYear(), 11, 31);
          } else {
            // Try to parse the date
            deadline = new Date(goalData.deadline);
            
            // Check if it resulted in an invalid date
            if (isNaN(deadline.getTime())) {
              console.log('Invalid date format, using end of year instead');
              deadline = new Date(new Date().getFullYear(), 11, 31);
            }
          }
        } else {
          // Default to end of year
          deadline = new Date(new Date().getFullYear(), 11, 31);
        }
      } catch (e) {
        console.log('Error parsing deadline, using end of year:', e);
        deadline = new Date(new Date().getFullYear(), 11, 31);
      }
      
      console.log('Creating goal with:');
      console.log('- userId:', mongoUserId);
      console.log('- title:', goalData.title);
      console.log('- category:', category);
      console.log('- deadline:', deadline.toISOString());
      
      // Create and save goal
      const goal = new Goal({
        user: mongoUserId, // Use the MongoDB ObjectId
        title: goalData.title || 'Untitled Goal',
        description: goalData.description || '',
        category: category,
        priority: goalData.priority || 'medium',
        status: goalData.status || 'in progress',
        deadline: deadline
      });
      
      const savedGoal = await goal.save();
      console.log('Goal saved successfully with ID:', savedGoal._id);
      
      return { 
        success: true, 
        goal: {
          id: savedGoal._id,
          title: savedGoal.title,
          category: savedGoal.category,
          deadline: savedGoal.deadline
        }
      };
    } catch (error) {
      console.error('Error in direct goal save operation:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Fallback method for saving a task
   * @param {Object} taskData - Task data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Result
   */
  async fallbackSaveTask(taskData, userId) {
    try {
      // Handle direct chat user
      if (userId === 'direct_chat_user') {
        const directChatUserId = await User.createDirectChatUser();
        if (directChatUserId) {
          userId = directChatUserId;
        } else {
          return { success: false, error: 'Failed to create user for task' };
        }
      }
      
      // Parse due date
      let dueDate;
      if (taskData.dueDate) {
        try {
          dueDate = new Date(taskData.dueDate);
        } catch (e) {
          dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 7);
        }
      } else {
        dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);
      }
      
      // Create and save task
      const task = new Task({
        user: userId,
        goal: taskData.goalId || undefined,
        title: taskData.title || 'Untitled Task',
        description: taskData.description || '',
        priority: taskData.priority || 'medium',
        dueDate: dueDate,
        tags: taskData.tags || [],
        completed: false,
        aiSuggested: true
      });
      
      await task.save();
      
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
      console.error('Error in fallback save task:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Fallback method for updating a goal
   * @param {string} goalId - Goal ID
   * @param {Object} updates - Update data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Result
   */
  async fallbackUpdateGoal(goalId, updates, userId) {
    try {
      // Find goal
      const goal = await Goal.findOne({
        _id: goalId,
        user: userId
      });
      
      if (!goal) {
        return { success: false, error: 'Goal not found or not owned by user' };
      }
      
      // Apply updates
      Object.keys(updates).forEach(key => {
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
      
      await goal.save();
      
      return { success: true, goal };
    } catch (error) {
      console.error('Error in fallback update goal:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Fallback method for updating a task
   * @param {string} taskId - Task ID
   * @param {Object} updates - Update data
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Result
   */
  async fallbackUpdateTask(taskId, updates, userId) {
    try {
      // Find task
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
      
      await task.save();
      
      // If task is linked to a goal, update progress
      if (task.goal) {
        const goal = await Goal.findById(task.goal);
        if (goal) {
          await goal.updateProgress();
        }
      }
      
      return { success: true, task };
    } catch (error) {
      console.error('Error in fallback update task:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get mock implementation for testing without API
   * @param {string} prompt - Implementation prompt
   * @returns {string} - Mock response
   */
  getMockImplementation(prompt) {
    console.log('Using direct database operations instead of Claude-generated code');
    
    // Return a code block that will trigger our fallback implementation
    return `
      <code>
      // This will trigger the fallback implementation
      return { directOperationRequired: true };
      </code>
    `;
  }
  
  // Keep original code for documentation - unused now
  // eslint-disable-next-line no-unused-vars
  getOriginalMockImplementation(prompt) {
    if (prompt.includes('saveGoal')) {
      return `
        <code>
        async function saveGoal(goalData, userId) {
          try {
            // Handle direct chat user
            if (userId === 'direct_chat_user') {
              const directChatUserId = await User.createDirectChatUser();
              if (directChatUserId) {
                userId = directChatUserId;
              } else {
                return { success: false, error: 'Failed to create user for goal' };
              }
            }
            
            // Ensure valid category
            let category = 'other';
            if (goalData.category) {
              if (['career', 'health', 'personal', 'financial', 'other'].includes(
                goalData.category.toLowerCase())) {
                category = goalData.category.toLowerCase();
              } else if (goalData.category.toLowerCase() === 'fitness') {
                category = 'health';
              }
            }
            
            // Create and save goal
            const goal = new Goal({
              user: userId,
              title: goalData.title || 'Untitled Goal',
              description: goalData.description || '',
              category: category,
              priority: goalData.priority || 'medium',
              status: goalData.status || 'in progress',
              deadline: goalData.deadline ? new Date(goalData.deadline) : new Date()
            });
            
            await goal.save();
            
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
        
        return await saveGoal(data, userId);
        </code>
        
        I've implemented a function to save a goal to the database. The code:
        1. Handles the direct_chat_user case by obtaining a real MongoDB ID
        2. Validates and normalizes the category (ensuring fitness maps to health)
        3. Creates a new Goal document with the provided data
        4. Saves it to the database
        5. Returns a success response with the goal ID and details
      `;
    } else if (prompt.includes('saveTask')) {
      return `
        <code>
        async function saveTask(taskData, userId) {
          try {
            // Handle direct chat user
            if (userId === 'direct_chat_user') {
              const directChatUserId = await User.createDirectChatUser();
              if (directChatUserId) {
                userId = directChatUserId;
              } else {
                return { success: false, error: 'Failed to create user for task' };
              }
            }
            
            // Create and save task
            const task = new Task({
              user: userId,
              goal: taskData.goalId || undefined,
              title: taskData.title || 'Untitled Task',
              description: taskData.description || '',
              priority: taskData.priority || 'medium',
              dueDate: taskData.dueDate ? new Date(taskData.dueDate) : new Date(),
              tags: taskData.tags || [],
              completed: false,
              aiSuggested: true
            });
            
            await task.save();
            
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
        
        return await saveTask(data, userId);
        </code>
        
        I've implemented a function to save a task to the database. The code:
        1. Handles the direct_chat_user case
        2. Creates a new Task document with the provided data
        3. Saves it to the database
        4. If the task is linked to a goal, it updates the goal's task list
        5. Returns a success response with the task ID and details
      `;
    } else {
      return `
        <code>
        async function mockImplementation() {
          return { 
            success: true, 
            message: 'Mock implementation executed' 
          };
        }
        
        return await mockImplementation();
        </code>
        
        I've implemented a mock function that simulates success.
      `;
    }
  }
}

module.exports = ClaudeCodeImplementer;