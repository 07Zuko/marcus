const OpenAI = require('openai');
const config = require('../../../config');
const User = require('../../../models/User');
const Goal = require('../../../models/Goal');
const Task = require('../../../models/Task');
const Log = require('../../../models/Log');

/**
 * Conversation Manager
 * Primary AI that coordinates conversation flow and delegates to specialized services
 */
class ConversationManager {
  constructor(serviceRegistry) {
    this.serviceRegistry = serviceRegistry;
    
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true // Only for testing
    });
    
    // Default system prompt
    this.defaultSystemPrompt = `
      You are Racho, an AI Assistant in a goal-tracking app. Keep responses brief and conversational.
      
      As a coach and cofounder, you help users achieve their goals, track tasks, and improve productivity.
      Be friendly, supportive, and to-the-point.
      
      For goal or task creation, adopt a casual tone - avoid being overly formal or asking too many questions.
      
      If user asks how you can help, say: "I can help with goal tracking, tasks, and coaching. What's on your mind?"
    `;
  }

  /**
   * Process a conversation with the user
   * @param {Array} messages - Message history
   * @param {string} userId - User ID for context
   * @returns {Promise<Object>} - AI response
   */
  async processConversation(messages, userId) {
    console.log('========== CONVERSATION MANAGER: Processing new conversation ==========');
    console.log('User ID:', userId);
    console.log('Number of messages:', messages.length);
    
    // For debugging, write messages to log file
    const fs = require('fs');
    const logPath = '/Users/charlier/Documents/marcus/racho_website/logs/conversation.log';
    
    try {
      fs.appendFileSync(logPath, 
        `\n\n---------- NEW REQUEST (${new Date().toISOString()}) ----------\n` +
        `Messages: ${messages.length}\n` +
        `User ID: ${userId}\n` +
        `Last user message: ${messages.length > 0 ? messages[messages.length-1].content : 'None'}\n` +
        `Complete message history:\n${JSON.stringify(messages, null, 2)}\n`
      );
    } catch (fsError) {
      console.error('Error writing to log file:', fsError);
    }
    
    try {
      // For goals and task creation, we need to aggressively check the conversation
      // First check for goal-related messages
      const isGoalRelated = this.isGoalConversation(messages);
      
      if (isGoalRelated) {
        console.log('DETECTED GOAL-RELATED CONVERSATION');
        // Try the goal service directly
        const goalService = this.getServiceByName('GoalService');
        if (goalService) {
          try {
            console.log('Redirecting directly to goal service');
            fs.appendFileSync(logPath, 'REDIRECTED TO GOAL SERVICE DIRECTLY\n');
            return await goalService.process(messages, userId);
          } catch (goalError) {
            console.error('Error processing with goal service:', goalError);
            fs.appendFileSync(logPath, `Goal service error: ${goalError.message}\n`);
          }
        }
      }
      
      // Try to find a specialized service that can handle this request
      console.log('Checking all registered services...');
      const specializedService = await this.serviceRegistry.findService(messages);
      
      if (specializedService) {
        console.log(`Using specialized service: ${specializedService.getName()}`);
        fs.appendFileSync(logPath, `Using service: ${specializedService.getName()}\n`);
        
        let result;
        try {
          result = await specializedService.process(messages, userId);
          fs.appendFileSync(logPath, `Service response: ${JSON.stringify(result?.message?.content || 'No content')}\n`);
          return result;
        } catch (serviceError) {
          console.error(`Error in ${specializedService.getName()}:`, serviceError);
          fs.appendFileSync(logPath, `Service error: ${serviceError.message}\n`);
          // Continue to main conversation as fallback
        }
      }
      
      // No specialized service found, handle with the main conversation flow
      console.log('Using main conversation flow');
      fs.appendFileSync(logPath, 'Using main conversation flow\n');
      const result = await this.handleMainConversation(messages, userId);
      
      fs.appendFileSync(logPath, `Main response: ${JSON.stringify(result?.message?.content || 'No content')}\n`);
      return result;
    } catch (error) {
      console.error('Error in conversation manager:', error);
      fs.appendFileSync(logPath, `ERROR in conversation manager: ${error.message}\n`);
      throw new Error(`Conversation processing error: ${error.message}`);
    }
  }
  
  /**
   * Check if the conversation is goal-related
   * @param {Array} messages - Message history
   * @returns {boolean} - Whether the conversation is goal-related
   */
  isGoalConversation(messages) {
    if (messages.length === 0) return false;
    
    // Check all user messages for goal-related keywords
    const userMessages = messages.filter(m => m.role === 'user');
    for (const msg of userMessages) {
      const content = msg.content.toLowerCase();
      
      // Check for goal-related keywords
      if (
        content.includes('goal') || 
        content.includes('bench press') ||
        content.includes('stronger') ||
        content.includes('gym') ||
        content.includes('fitness')
      ) {
        return true;
      }
    }
    
    // Check for confirmation of goal creation
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user') {
      const content = lastMessage.content.toLowerCase();
      const confirmationWords = ['yes', 'yeah', 'yep', 'sure', 'please', 'ok', 'okay'];
      
      // Simple confirmation
      if (confirmationWords.some(word => content === word || content === word + '.')) {
        // Check if previous assistant message was about goals
        for (let i = messages.length - 2; i >= 0; i--) {
          const msg = messages[i];
          if (msg.role === 'assistant') {
            const assistantContent = msg.content.toLowerCase();
            if (
              (assistantContent.includes('goal') && 
                (assistantContent.includes('set') || assistantContent.includes('add') || assistantContent.includes('create'))) ||
              assistantContent.includes('bench press') ||
              (assistantContent.includes('stronger') && assistantContent.includes('gym'))
            ) {
              return true;
            }
            break; // Only check the most recent assistant message
          }
        }
      }
    }
    
    return false;
  }
  
  /**
   * Get a specific service by name
   * @param {string} name - Service name
   * @returns {BaseService|null} - Service instance or null
   */
  getServiceByName(name) {
    for (const service of this.serviceRegistry.getServices()) {
      if (service.getName() === name) {
        return service;
      }
    }
    return null;
  }

  /**
   * Handle the main conversation flow with the general-purpose AI
   * @param {Array} messages - Message history
   * @param {string} userId - User ID for context
   * @returns {Promise<Object>} - AI response
   */
  async handleMainConversation(messages, userId) {
    try {
      // Fetch user context to enhance the conversation
      const userContext = await this.fetchUserContext(userId);
      
      // Build the enhanced system prompt with user context
      const systemPrompt = this.buildSystemPrompt(userContext);
      
      // Create the complete message array with system prompt
      const completeMessages = [
        {
          role: 'system',
          content: systemPrompt
        },
        ...messages
      ];
      
      // Call OpenAI with the enhanced messages
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: completeMessages,
        temperature: 0.7,
        max_tokens: 500
      });
      
      return {
        message: completion.choices[0].message,
        usage: completion.usage,
        model: completion.model
      };
    } catch (error) {
      console.error('Error in main conversation handler:', error);
      
      // Provide a fallback response if OpenAI fails
      return {
        message: {
          role: 'assistant',
          content: "I'm sorry, I'm having trouble processing your request right now. Could you try again in a moment?"
        },
        model: 'fallback',
        usage: { total_tokens: 0 }
      };
    }
  }

  /**
   * Build the system prompt with user context
   * @param {Object} userContext - Context about the user
   * @returns {string} - Enhanced system prompt
   */
  buildSystemPrompt(userContext) {
    let systemPrompt = this.defaultSystemPrompt;
    
    // Only add context if it exists
    if (userContext.user || userContext.activeGoals?.length || userContext.upcomingTasks?.length) {
      systemPrompt += `\n\nUser Context:
${userContext.user ? `Name: ${userContext.user.name}` : ''}

${userContext.activeGoals?.length ? `Active Goals: 
${userContext.activeGoals.map(g => `- ${g.title} (Priority: ${g.priority})`).join('\n')}` : ''}

${userContext.upcomingTasks?.length ? `Upcoming Tasks: 
${userContext.upcomingTasks.map(t => `- ${t.title} (Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'Not set'})`).join('\n')}` : ''}

${userContext.recentLogs?.length ? `Recent Logs: 
${userContext.recentLogs.map(l => `- ${l.title} (${l.date ? new Date(l.date).toLocaleDateString() : 'Not dated'}, Mood: ${l.rating || 'Not rated'})`).join('\n')}` : ''}`;
    }
    
    return systemPrompt;
  }

  /**
   * Fetch context about the user to enhance the conversation
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - User context
   */
  async fetchUserContext(userId) {
    try {
      // Get user's active goals
      const goals = await Goal.find({ 
        user: userId,
        status: { $ne: 'completed' }
      }).sort({ priority: -1 }).limit(5);
      
      // Get recent tasks
      const tasks = await Task.find({
        user: userId,
        completed: false
      }).sort({ dueDate: 1 }).limit(10);
      
      // Get recent logs for context
      const logs = await Log.find({
        user: userId
      }).sort({ date: -1 }).limit(5);
      
      // User profile
      const user = await User.findById(userId);
      
      return {
        user: user ? {
          name: user.name,
          preferences: user.preferences
        } : { name: "Guest User", preferences: {} },
        activeGoals: goals.map(g => ({
          title: g.title,
          priority: g.priority,
          progress: g.progress,
          category: g.category
        })),
        upcomingTasks: tasks.map(t => ({
          title: t.title,
          priority: t.priority,
          dueDate: t.dueDate,
          goalRelated: t.goal ? true : false
        })),
        recentLogs: logs.map(l => ({
          title: l.title,
          category: l.category,
          date: l.date,
          rating: l.rating
        }))
      };
    } catch (error) {
      console.error('Error fetching user context:', error);
      return {};
    }
  }
}

module.exports = ConversationManager;