const OpenAI = require('openai');
const config = require('../../../config');
const User = require('../../../models/User');
const Goal = require('../../../models/Goal');
const Task = require('../../../models/Task');
const Log = require('../../../models/Log');

/**
 * AI Orchestrator
 * Top-level AI that handles conversation and routes to specialized services
 * Replaces ConversationManager as the main entry point for AI services
 */
class AIOrchestrator {
  constructor(serviceRegistry) {
    this.serviceRegistry = serviceRegistry;
    
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true // Only for testing
    });
    
    // Default system prompt
    this.defaultSystemPrompt = `
      You are Marcus, an AI Assistant in a goal-tracking app. Keep responses brief and conversational.
      
      As a coach and cofounder, you help users achieve their goals, track tasks, and improve productivity.
      Be friendly, supportive, and to-the-point.
      
      Your role is to act as a life coach, confidant, therapist, and cofounder.
      
      When users need specialized help with specific goals, tasks, or coding, you'll collaborate with
      specialized AI systems that have deeper expertise in those areas.
      
      If user asks how you can help, say: "I can help with goal tracking, tasks, coaching, and more. 
      What's on your mind?"
    `;
    
    // Conversation memory
    this.conversationMemory = [];
    this.memoryCapacity = 10; // Number of messages to keep in memory
    
    // Debug logging
    this.enableDebugLogging = true;
    this.logPath = '/Users/charlier/Documents/marcus/aurelius_website/logs/orchestrator.log';
    
    // Initialize conversational memory
    console.log("AI Orchestrator initialized with conversation memory");
  }

  /**
   * Process a conversation with the user
   * @param {Array} messages - Message history
   * @param {string} userId - User ID for context
   * @returns {Promise<Object>} - AI response
   */
  async processConversation(messages, userId) {
    this.logDebug('========== AI ORCHESTRATOR: Processing conversation ==========');
    this.logDebug('User ID:', userId);
    this.logDebug('Number of messages:', messages.length);
    
    try {
      // Update conversation memory with the latest message
      this.updateConversationMemory(messages);
      
      // Create enhanced messages with memory for context
      const enhancedMessages = this.createEnhancedMessages(messages);
      this.logDebug('Using enhanced messages with memory:', enhancedMessages.length);
      
      // First, determine if we need a specialist
      const intent = await this.classifyIntent(enhancedMessages);
      this.logDebug('Detected intent:', intent);
      
      // Find specialists that handle this intent
      const matchingSpecialists = this.findSpecialistsForIntent(intent);
      this.logDebug('Matching specialists:', matchingSpecialists.map(s => s.getName()));
      
      let response;
      
      if (matchingSpecialists.length > 0) {
        // Get confidence scores from each specialist
        const scoredSpecialists = await Promise.all(
          matchingSpecialists.map(async (specialist) => {
            const confidence = await specialist.getConfidenceScore(enhancedMessages);
            return { specialist, confidence };
          })
        );
        
        // Find the most confident specialist
        const bestMatch = scoredSpecialists.reduce(
          (best, current) => (current.confidence > best.confidence ? current : best),
          { confidence: 0 }
        );
        
        this.logDebug('Best specialist match:', 
          bestMatch.specialist ? bestMatch.specialist.getName() : 'None', 
          'with confidence:', bestMatch.confidence);
        
        // Only use the specialist if confidence is high enough
        if (bestMatch.confidence > 0.6 && bestMatch.specialist) {
          this.logDebug('Routing to specialist:', bestMatch.specialist.getName());
          response = await bestMatch.specialist.process(enhancedMessages, userId);
        }
      }
      
      // If no specialist handled it, check for specialized services (legacy approach)
      if (!response) {
        const specializedService = await this.serviceRegistry.findService(enhancedMessages);
        
        if (specializedService) {
          this.logDebug('Using specialized service:', specializedService.getName());
          response = await specializedService.process(enhancedMessages, userId);
        }
      }
      
      // If still no response, handle with general conversation
      if (!response) {
        this.logDebug('Using general conversation handler');
        response = await this.handleGeneralConversation(enhancedMessages, userId);
      }
      
      // Store the assistant's response in memory
      if (response && response.message) {
        this.updateConversationMemory([response.message]);
      }
      
      return response;
    } catch (error) {
      console.error('Error in AI Orchestrator:', error);
      this.logDebug('ERROR:', error.message);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm having trouble processing your request. Could you try again?"
        },
        model: 'error-fallback',
        usage: { total_tokens: 0 }
      };
    }
  }
  
  /**
   * Update the conversation memory with new messages
   * @param {Array} messages - New messages to add to memory
   */
  updateConversationMemory(messages) {
    if (!messages || !messages.length) return;
    
    try {
      // Filter out system messages and sanitize content
      const filteredMessages = messages
        .filter(m => m.role !== 'system')
        .map(m => {
          // Ensure content is a string to prevent issues
          return {
            role: m.role,
            content: typeof m.content === 'string' ? m.content : 
                      (m.content ? JSON.stringify(m.content) : 'Content not available')
          };
        });
      
      // Initialize if needed
      if (!this.conversationMemory) {
        this.conversationMemory = [];
      }
      
      // Add new messages to memory
      this.conversationMemory = [...this.conversationMemory, ...filteredMessages];
      
      // Keep only the most recent messages up to capacity
      if (this.conversationMemory.length > this.memoryCapacity) {
        this.conversationMemory = this.conversationMemory.slice(-this.memoryCapacity);
      }
      
      this.logDebug('Updated conversation memory:', this.conversationMemory.length, 'messages');
    } catch (error) {
      console.error('Error updating conversation memory:', error);
      // Initialize memory if it wasn't already
      if (!this.conversationMemory) {
        this.conversationMemory = [];
      }
    }
  }
  
  /**
   * Create enhanced messages with memory context
   * @param {Array} messages - Current message batch
   * @returns {Array} - Enhanced messages with memory
   */
  createEnhancedMessages(messages) {
    // Skip if there are no new messages
    if (!messages || !messages.length) return messages;
    
    // Extract the current user message (usually the last one)
    const userMessages = messages.filter(m => m.role === 'user');
    const currentUserMessage = userMessages.length ? userMessages[userMessages.length - 1] : null;
    
    // If no user message, return original messages
    if (!currentUserMessage) return messages;
    
    // Skip if memory is empty
    if (!this.conversationMemory || this.conversationMemory.length === 0) {
      return messages;
    }
    
    try {
      // Create a memory summary for context
      const memoryContext = {
        role: 'system',
        content: `Recent conversation context:
${this.conversationMemory.map(m => 
  `${m.role.toUpperCase()}: ${
    typeof m.content === 'string' ? 
      (m.content.substring(0, 100) + (m.content.length > 100 ? '...' : '')) :
      'Content not available'
  }`
).join('\n')}

Remember this conversation context when responding to the user's current message.`
      };
      
      // Return messages with memory context injected
      return [memoryContext, ...messages];
    } catch (error) {
      console.error('Error creating enhanced messages:', error);
      return messages; // Return original messages in case of error
    }
  }
  
  /**
   * Classify the intent of the user's message
   * @param {Array} messages - Message history
   * @returns {Promise<string>} - Classified intent
   */
  async classifyIntent(messages) {
    const lastMessage = messages[messages.length - 1];
    
    // Only classify user messages
    if (lastMessage.role !== 'user') {
      return 'general';
    }
    
    try {
      // Use OpenAI to classify the intent
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `Classify the user message into exactly one of these categories:
            - goal_tracking: Setting or managing goals
            - task_management: Creating or updating tasks
            - fitness: Exercise, health, nutrition, wellness
            - productivity: Time management, organization, efficiency
            - programming: Code, development, technical questions
            - therapy: Emotional support, mental health, life challenges
            - general: General conversation or anything else
            
            Return only the category name, nothing else.`
          },
          { role: 'user', content: lastMessage.content }
        ],
        temperature: 0.3,
        max_tokens: 20
      });
      
      const intent = response.choices[0].message.content.trim().toLowerCase();
      return intent;
    } catch (error) {
      console.error('Error classifying intent:', error);
      return 'general';
    }
  }
  
  /**
   * Find specialists that handle a specific intent
   * @param {string} intent - Intent to match
   * @returns {Array} - List of matching specialists
   */
  findSpecialistsForIntent(intent) {
    const specialists = this.serviceRegistry.getSpecialists();
    return specialists.filter(specialist => specialist.handlesIntent(intent));
  }
  
  /**
   * Handle general conversation with the main AI
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - AI response
   */
  async handleGeneralConversation(messages, userId) {
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
      console.error('Error in general conversation handler:', error);
      
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
      // Handle direct chat user case
      if (userId === 'direct_chat_user') {
        this.logDebug('Handling direct_chat_user with dedicated ObjectID');
        
        // Get or create an actual user for direct chat
        const directChatUserId = await User.createDirectChatUser();
        
        if (directChatUserId) {
          this.logDebug('Using persistent direct chat user ID:', directChatUserId);
          userId = directChatUserId; // Replace with actual MongoDB ID
        } else {
          this.logDebug('Failed to create direct chat user, using guest context');
          return {
            user: { name: "Guest User", preferences: {} },
            activeGoals: [],
            upcomingTasks: [],
            recentLogs: [],
            conversationMemory: this.conversationMemory || []
          };
        }
      }
      
      // Get user's active goals
      const goals = await Goal.find({ 
        user: userId,
        status: { $ne: 'completed' }
      }).sort({ priority: -1 }).limit(5);
      this.logDebug(`Found ${goals.length} active goals for user`);
      
      // Get recent tasks
      const tasks = await Task.find({
        user: userId,
        completed: false
      }).sort({ dueDate: 1 }).limit(10);
      this.logDebug(`Found ${tasks.length} upcoming tasks for user`);
      
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
        })),
        conversationMemory: this.conversationMemory || []
      };
    } catch (error) {
      console.error('Error fetching user context:', error);
      // Return a minimal context to avoid breaking the flow
      return {
        user: { name: "Guest User", preferences: {} },
        activeGoals: [],
        upcomingTasks: [],
        recentLogs: [],
        conversationMemory: this.conversationMemory || []
      };
    }
  }
  
  /**
   * Log debug information
   * @param  {...any} args - Arguments to log
   */
  logDebug(...args) {
    if (!this.enableDebugLogging) return;
    
    console.log(...args);
    
    // Write to log file
    const fs = require('fs');
    try {
      fs.appendFileSync(
        this.logPath,
        `${new Date().toISOString()} - ${args.join(' ')}\n`
      );
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }
}

module.exports = AIOrchestrator;