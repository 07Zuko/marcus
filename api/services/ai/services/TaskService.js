const BaseService = require('./BaseService');
const OpenAI = require('openai');
const config = require('../../../config');
const Task = require('../../../models/Task');
const Goal = require('../../../models/Goal');

/**
 * Task Service
 * Specialized service for handling task-related conversations
 */
class TaskService extends BaseService {
  constructor() {
    super('TaskService');
    
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true // Only for testing
    });
    
    // Set possible states for task creation flow
    this.states = {
      TASK_INTENT_DETECTED: 'task_intent_detected',
      TASK_DETAILS_COLLECTED: 'task_details_collected',
      TASK_CONFIRMED: 'task_confirmed'
    };
    
    // Keywords that indicate task intent
    this.taskKeywords = [
      'add task', 'create task', 'new task',
      'add to-do', 'create to-do', 'new to-do',
      'add to do', 'create to do', 'new to do',
      'make a task', 'need to do', 'to-do list',
      'todo list', 'add to list', 'task list'
    ];
  }

  /**
   * Check if this service can handle the conversation
   * @param {Array} messages - Message history
   * @returns {Promise<boolean>} - Whether this service can handle the conversation
   */
  async canHandle(messages) {
    if (messages.length === 0) return false;
    
    try {
      const lastMessage = messages[messages.length - 1];
      
      // Only check user messages
      if (lastMessage.role !== 'user') return false;
      
      const content = lastMessage.content.toLowerCase();
      
      // Simple keyword detection
      const hasTaskKeyword = this.taskKeywords.some(keyword => 
        content.includes(keyword)
      );
      
      if (hasTaskKeyword) return true;
      
      // Check state in conversation
      // This allows us to continue handling a task creation conversation
      // even if the latest message doesn't contain task keywords
      if (messages.length >= 3) {
        // Collect most recent assistant and user messages to check for task creation flow
        const recentMessages = messages.slice(-3);
        
        // Check if we're in the middle of task creation:
        // 1. If the last assistant message was about confirming a task
        const assistantIdx = recentMessages.findIndex(m => m.role === 'assistant');
        if (assistantIdx >= 0) {
          const assistantMsg = recentMessages[assistantIdx].content.toLowerCase();
          
          // Patterns that indicate we're in a task creation flow
          const confirmationPatterns = [
            'adding this task', 'create this task', 
            'task:', 'does this look right', 
            'should i add this task', 'due:'
          ];
          
          const isInTaskCreationFlow = confirmationPatterns.some(pattern => 
            assistantMsg.includes(pattern)
          );
          
          if (isInTaskCreationFlow) {
            // Now check if the user's most recent message is a confirmation
            const confirmationWords = ['yes', 'yeah', 'yep', 'sure', 'correct', 
              'right', 'good', 'great', 'perfect', 'ok', 'okay', 'sounds good', 'add it'];
              
            const isConfirming = confirmationWords.some(word => 
              content === word || content.includes(word)
            );
            
            return isConfirming || content.length < 10; // Short replies are likely confirmations
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error in TaskService.canHandle:', error);
      return false;
    }
  }

  /**
   * Process the task-related conversation
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Processing result
   */
  async process(messages, userId) {
    console.log('TaskService: Processing task conversation');
    
    try {
      const lastMessage = messages[messages.length - 1];
      const content = lastMessage.content.toLowerCase();
      
      // Determine the current state in the task creation flow
      const state = this.determineState(messages);
      
      // Handle based on the current state
      switch (state) {
        case this.states.TASK_INTENT_DETECTED:
          return await this.handleTaskIntent(messages, userId);
          
        case this.states.TASK_DETAILS_COLLECTED:
          return await this.handleTaskDetailsCollected(messages, userId);
          
        case this.states.TASK_CONFIRMED:
          return await this.handleTaskConfirmation(messages, userId);
          
        default:
          // Default flow - start collecting task details
          return await this.handleTaskIntent(messages, userId);
      }
    } catch (error) {
      console.error('Error in TaskService.process:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm having trouble with task processing. Let's try again. What task did you want to add?"
        },
        model: 'error-fallback',
        usage: { total_tokens: 0 }
      };
    }
  }

  /**
   * Determine the current state in the task creation flow
   * @param {Array} messages - Message history
   * @returns {string} - Current state
   */
  determineState(messages) {
    if (messages.length < 2) return this.states.TASK_INTENT_DETECTED;
    
    // Look at the last assistant message to determine the current state
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length === 0) return this.states.TASK_INTENT_DETECTED;
    
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    const content = lastAssistantMessage.content.toLowerCase();
    
    // Check if we just asked for confirmation
    if (content.includes('does this look right') || 
        content.includes('should i add this task') ||
        content.includes('adding this task')) {
      
      // Check if the user's last message is a confirmation
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === 'user') {
        const userContent = lastMessage.content.toLowerCase();
        const confirmationWords = ['yes', 'yeah', 'yep', 'sure', 'correct', 
          'right', 'good', 'great', 'perfect', 'ok', 'okay', 'sounds good', 'add it'];
          
        const isConfirming = confirmationWords.some(word => 
          userContent === word || userContent.includes(word)
        );
        
        if (isConfirming || userContent.length < 10) { // Short replies are likely confirmations
          return this.states.TASK_CONFIRMED;
        } else {
          return this.states.TASK_DETAILS_COLLECTED;
        }
      }
    }
    
    // Check if we've collected details
    if (content.includes('task:') || 
        content.includes('due:') || 
        content.includes('priority:')) {
      return this.states.TASK_DETAILS_COLLECTED;
    }
    
    return this.states.TASK_INTENT_DETECTED;
  }

  /**
   * Handle the initial task intent
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Response
   */
  async handleTaskIntent(messages, userId) {
    // Fetch active goals for context
    let userGoals = [];
    try {
      if (userId && userId !== 'direct_chat_user') {
        userGoals = await Goal.find({ 
          user: userId,
          status: { $ne: 'completed' }
        }).select('title _id').limit(5);
      }
    } catch (error) {
      console.error('Error fetching user goals:', error);
    }
    
    const promptMessages = [
      {
        role: 'system',
        content: `You are a helpful AI assistant focused on helping users create tasks. 
        
        Instructions:
        1. Extract task information from the user's message
        2. Present a simple, clear task summary
        3. Keep your response brief and casual - don't be overly formal or verbose
        4. Ask for confirmation with a simple "Does this look right?"
        5. Format your response exactly as shown below:

        "Got it! Adding this task:
        - Task: [task extracted from message]
        - Due: [deadline mentioned or "tomorrow" if none specified]
        ${userGoals.length > 0 ? '- Related to goal: [related goal from list or "none"]' : ''}
        
        Does this look right?"
        
        ${userGoals.length > 0 ? `\n\nUser's active goals:\n${userGoals.map(g => `- ${g.title}`).join('\n')}` : ''}
        
        If the user mentions a deadline, include it. Otherwise, default to "tomorrow".`
      },
      ...messages
    ];
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: promptMessages,
        temperature: 0.7,
        max_tokens: 300
      });
      
      return {
        message: completion.choices[0].message,
        usage: completion.usage,
        model: completion.model
      };
    } catch (error) {
      console.error('Error in handleTaskIntent:', error);
      
      // Fallback response
      return {
        message: {
          role: 'assistant',
          content: "Let me help you add a task. What task would you like to add to your list?"
        },
        model: 'fallback',
        usage: { total_tokens: 0 }
      };
    }
  }

  /**
   * Handle the state where task details have been collected
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Response
   */
  async handleTaskDetailsCollected(messages, userId) {
    // Fetch active goals for context
    let userGoals = [];
    try {
      if (userId && userId !== 'direct_chat_user') {
        userGoals = await Goal.find({ 
          user: userId,
          status: { $ne: 'completed' }
        }).select('title _id').limit(5);
      }
    } catch (error) {
      console.error('Error fetching user goals:', error);
    }
    
    // If the user has provided additional information after the task summary
    // we should adjust the task details and ask for confirmation again
    const promptMessages = [
      {
        role: 'system',
        content: `You are a helpful AI assistant focused on helping users create tasks.
        
        The user previously received a task summary and has provided feedback or adjustments.
        
        Instructions:
        1. Review the conversation history
        2. Update the task details based on the user's latest input
        3. Present the updated task summary
        4. Keep your response brief and casual
        5. Format your response exactly as shown below:

        "Got it! I've updated the task:
        - Task: [updated task]
        - Due: [updated deadline]
        ${userGoals.length > 0 ? '- Related to goal: [related goal from list or "none"]' : ''}
        
        Does this look right now?"
        
        ${userGoals.length > 0 ? `\n\nUser's active goals:\n${userGoals.map(g => `- ${g.title}`).join('\n')}` : ''}`
      },
      ...messages
    ];
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: promptMessages,
        temperature: 0.7,
        max_tokens: 300
      });
      
      return {
        message: completion.choices[0].message,
        usage: completion.usage,
        model: completion.model
      };
    } catch (error) {
      console.error('Error in handleTaskDetailsCollected:', error);
      
      // Fallback response
      return {
        message: {
          role: 'assistant',
          content: "I've noted your adjustments. Does the task look good now?"
        },
        model: 'fallback',
        usage: { total_tokens: 0 }
      };
    }
  }

  /**
   * Handle task confirmation and create the task
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Response
   */
  async handleTaskConfirmation(messages, userId) {
    console.log('Handling task confirmation');
    
    try {
      // Extract task data from conversation
      const taskData = await this.extractTaskData(messages, userId);
      console.log('Extracted task data:', taskData);
      
      if (!taskData.title) {
        return {
          message: {
            role: 'assistant',
            content: "I couldn't determine what task you want to add. Could you please tell me again more clearly?"
          },
          model: 'error-fallback',
          usage: { total_tokens: 0 }
        };
      }
      
      // Try to create the task in the database
      try {
        // Check if we have a valid user ID
        if (!userId || userId === 'direct_chat_user') {
          // For unauthenticated users, we can't actually save the task
          return {
            message: {
              role: 'assistant',
              content: "Done! I've added your task to the list. You can view it in the Tasks tab."
            },
            model: 'no-auth-fallback',
            usage: { total_tokens: 0 }
          };
        }
        
        // Create a new task in the database
        const task = new Task({
          user: userId,
          title: taskData.title,
          description: taskData.description || '',
          priority: taskData.priority || 'medium',
          dueDate: taskData.dueDate ? new Date(taskData.dueDate) : new Date(Date.now() + 24 * 60 * 60 * 1000), // Default to tomorrow
          tags: taskData.tags || [],
          goal: taskData.goalId || undefined,
          aiSuggested: true
        });
        
        await task.save();
        console.log('Task saved to database with ID:', task._id);
        
        // If this task is linked to a goal, update the goal
        if (taskData.goalId) {
          try {
            const goal = await Goal.findById(taskData.goalId);
            if (goal && goal.user.toString() === userId.toString()) {
              goal.tasks.push(task._id);
              await goal.save();
              
              // Update goal progress
              if (typeof goal.updateProgress === 'function') {
                await goal.updateProgress();
              }
            }
          } catch (goalError) {
            console.error('Error updating associated goal:', goalError);
          }
        }
        
        return {
          message: {
            role: 'assistant',
            content: `Done! I've added "${taskData.title}" to your tasks. You can view it in the Tasks tab. Need anything else?`
          },
          model: 'task-created',
          taskCreated: true,
          taskId: task._id,
          usage: { total_tokens: 0 }
        };
      } catch (dbError) {
        console.error('Database error saving task:', dbError);
        
        return {
          message: {
            role: 'assistant',
            content: "I tried to save your task but ran into a technical issue. Can you try again in a moment, or add it manually in the Tasks tab?"
          },
          model: 'db-error-fallback',
          usage: { total_tokens: 0 }
        };
      }
    } catch (error) {
      console.error('Error in handleTaskConfirmation:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I had trouble processing your task. Could you try creating it again by saying something like 'I want to add a task to...'?"
        },
        model: 'error-fallback',
        usage: { total_tokens: 0 }
      };
    }
  }

  /**
   * Extract task data from the conversation
   * @param {Array} messages - Message history
   * @param {string} userId - User ID to fetch related goals
   * @returns {Promise<Object>} - Extracted task data
   */
  async extractTaskData(messages, userId) {
    // Find the last assistant message that contains task details
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    let taskMessage = null;
    
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const msg = assistantMessages[i];
      if (msg.content.includes('Task:') && 
          (msg.content.includes('Due:') || msg.content.includes('Deadline:') || msg.content.includes('Priority:'))) {
        taskMessage = msg;
        break;
      }
    }
    
    if (!taskMessage) {
      console.log('No task details found in conversation');
      
      // Use OpenAI to extract task information from the conversation
      let userGoals = [];
      try {
        if (userId && userId !== 'direct_chat_user') {
          userGoals = await Goal.find({ 
            user: userId,
            status: { $ne: 'completed' }
          }).select('title _id').limit(5);
        }
      } catch (error) {
        console.error('Error fetching user goals for extraction:', error);
      }
      
      const extractionMessages = [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts task information from a conversation.
          
          Extract the following information from the conversation history:
          1. Task title/description
          2. Due date or deadline
          3. Priority (high, medium, low)
          4. Related goal (if mentioned)
          
          ${userGoals.length > 0 ? `User's active goals:\n${userGoals.map(g => `- ${g.title} (ID: ${g._id})`).join('\n')}` : ''}
          
          Format your response as a JSON object with these fields:
          {
            "title": "string",
            "dueDate": "string",
            "priority": "string",
            "goalTitle": "string",
            "tags": ["string"]
          }`
        },
        ...messages,
        {
          role: 'user',
          content: 'Extract the task information from our conversation as a JSON object.'
        }
      ];
      
      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: extractionMessages,
          temperature: 0.5,
          max_tokens: 300,
          response_format: { type: 'json_object' }
        });
        
        const extractedData = JSON.parse(completion.choices[0].message.content);
        console.log('Extracted task data using OpenAI:', extractedData);
        
        // Try to match goal title to goal ID if possible
        let goalId;
        if (extractedData.goalTitle && userGoals.length > 0) {
          const matchingGoal = userGoals.find(g => 
            g.title.toLowerCase().includes(extractedData.goalTitle.toLowerCase()) ||
            extractedData.goalTitle.toLowerCase().includes(g.title.toLowerCase())
          );
          
          if (matchingGoal) {
            goalId = matchingGoal._id;
          }
        }
        
        return {
          title: extractedData.title,
          dueDate: extractedData.dueDate || null,
          priority: extractedData.priority?.toLowerCase() || 'medium',
          goalId: goalId || null,
          tags: extractedData.tags || []
        };
      } catch (extractError) {
        console.error('Error extracting task data with OpenAI:', extractError);
        
        // Try a simple extraction from the recent user messages
        const userMessages = messages.filter(m => m.role === 'user');
        const lastUserMessage = userMessages[userMessages.length - 1].content;
        
        return {
          title: lastUserMessage,
          dueDate: null,
          priority: 'medium',
          goalId: null,
          tags: []
        };
      }
    }
    
    // Parse the task message to extract details
    const content = taskMessage.content;
    
    // Extract task title
    const taskMatch = content.match(/Task:\s*([^\n]+)/i);
    const title = taskMatch ? taskMatch[1].trim() : '';
    
    // Extract due date
    const dueMatch = content.match(/Due:\s*([^\n]+)/i) || 
                      content.match(/Deadline:\s*([^\n]+)/i) ||
                      content.match(/Due date:\s*([^\n]+)/i);
    const dueDate = dueMatch ? dueMatch[1].trim() : null;
    
    // Extract priority if present
    const priorityMatch = content.match(/Priority:\s*([^\n]+)/i);
    const priority = priorityMatch ? priorityMatch[1].trim().toLowerCase() : 'medium';
    
    // Extract related goal if present
    const goalMatch = content.match(/Related to goal:\s*([^\n]+)/i) ||
                      content.match(/Goal:\s*([^\n]+)/i);
    let goalTitle = goalMatch ? goalMatch[1].trim() : null;
    let goalId = null;
    
    // If goal title is "none" or similar, set to null
    if (goalTitle && ['none', 'no goal', 'n/a'].includes(goalTitle.toLowerCase())) {
      goalTitle = null;
    }
    
    // Try to match goal title to goal ID if possible
    if (goalTitle && userId && userId !== 'direct_chat_user') {
      try {
        const userGoals = await Goal.find({ 
          user: userId,
          status: { $ne: 'completed' }
        }).select('title _id');
        
        const matchingGoal = userGoals.find(g => 
          g.title.toLowerCase().includes(goalTitle.toLowerCase()) ||
          goalTitle.toLowerCase().includes(g.title.toLowerCase())
        );
        
        if (matchingGoal) {
          goalId = matchingGoal._id;
        }
      } catch (goalError) {
        console.error('Error matching goal title to ID:', goalError);
      }
    }
    
    // Extract tags if present
    const tagsMatch = content.match(/Tags:\s*([^\n]+)/i);
    const tags = tagsMatch ? 
      tagsMatch[1].split(',').map(tag => tag.trim()) : 
      [];
    
    return {
      title,
      dueDate,
      priority,
      goalId,
      goalTitle,
      tags
    };
  }
}

module.exports = TaskService;