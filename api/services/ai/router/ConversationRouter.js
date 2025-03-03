/**
 * Conversation Router
 * 
 * The top-level AI that analyzes conversations and routes to appropriate domain agents.
 * Handles sentiment, intent detection, and maintains conversation context
 */

class ConversationRouter {
  /**
   * Create a new Conversation Router
   * @param {OpenAI} openai - OpenAI instance 
   * @param {Array} agents - Domain agents for specialized handling
   */
  constructor(openai, agents) {
    this.openai = openai;
    this.agents = agents;
    
    // Conversation memory
    this.conversationMemory = new Map(); // userId -> array of messages
    this.memoryLimit = 20; // Max number of messages to keep per user
    
    // System prompt for the router
    this.routerSystemPrompt = `
      You are Marcus, the main AI assistant in a goal-tracking and personal development application.
      
      Your role is to:
      1. Understand the user's intent and sentiment
      2. Maintain a natural, fluid conversation
      3. Route to specialized AI agents when appropriate 
      4. Return control back to the user when tasks are completed
      
      You should be friendly, supportive, and conversational - like a helpful friend or coach.
      Keep responses brief and focused. Avoid corporate or overly formal language.
    `;
    
    // Debug logging
    this.enableDebug = true;
    console.log('Conversation Router initialized with', agents.length, 'domain agents');
  }
  
  /**
   * Process a conversation and route to appropriate agents
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - AI response
   */
  async processConversation(messages, userId) {
    this.debug('Processing conversation for user:', userId);
    this.debug('Messages count:', messages.length);
    
    // Update conversation memory
    this.updateConversationMemory(userId, messages);
    
    try {
      // Get complete conversation context with memory
      const contextualMessages = this.getContextualMessages(userId, messages);
      
      // Analyze conversation for sentiment and intent
      const analysis = await this.analyzeConversation(contextualMessages);
      this.debug('Conversation analysis:', analysis);
      
      // If analysis suggests hand-off to a domain agent
      if (analysis.routeToDomainAgent && analysis.domainIntent) {
        // Find the most appropriate agent
        const agent = this.findAppropriateAgent(analysis.domainIntent);
        
        if (agent) {
          this.debug('Routing to domain agent:', agent.getName());
          
          // Hand off conversation to specialized agent
          const agentResponse = await agent.processConversation(
            contextualMessages, 
            userId, 
            analysis
          );
          
          // Store agent response in memory
          if (agentResponse && agentResponse.message) {
            this.updateConversationMemory(userId, [agentResponse.message]);
          }
          
          return agentResponse;
        }
      }
      
      // Handle with general conversation if no agent or not routed
      return await this.handleGeneralConversation(contextualMessages, userId, analysis);
    } catch (error) {
      console.error('Error in conversation router:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm having a bit of trouble processing that right now. Could you try again or rephrase your message?"
        },
        model: 'error-fallback',
        usage: { total_tokens: 0 }
      };
    }
  }
  
  /**
   * Analyze conversation for sentiment and intent
   * @param {Array} messages - Message history with context
   * @returns {Promise<Object>} - Conversation analysis
   */
  async analyzeConversation(messages) {
    // Extract the last user message
    const userMessages = messages.filter(m => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    if (!lastUserMessage) {
      return { routeToDomainAgent: false };
    }
    
    try {
      const analysisMessages = [
        {
          role: 'system',
          content: `Analyze the user's message and conversation context to identify:
          
          1. Primary intent (What the user wants to do or know)
          2. Domain category (goal_setting, task_management, fitness_health, programming_technical, general_chat)
          3. Sentiment (positive, negative, neutral, confused)
          4. Whether this should be handled by a specialized domain agent
          
          Return ONLY a JSON object with these properties:
          {
            "primaryIntent": "string description of main intent",
            "domainIntent": "one of: goal_setting, task_management, fitness_health, programming_technical, general_chat",
            "sentiment": "one of: positive, negative, neutral, confused",
            "routeToDomainAgent": boolean,
            "confidence": number between 0-1
          }
          
          Do NOT include any explanation or additional text.`
        },
        ...messages.slice(-5), // Just the most recent messages for context
        {
          role: 'user',
          content: 'Analyze this conversation and return ONLY the JSON.'
        }
      ];
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: analysisMessages,
        temperature: 0.3,
        max_tokens: 150,
        response_format: { type: 'json_object' }
      });
      
      const result = JSON.parse(completion.choices[0].message.content);
      
      // Add some logic to determine routing
      if (!result.routeToDomainAgent) {
        result.routeToDomainAgent = 
          result.domainIntent !== 'general_chat' && 
          result.confidence >= 0.6;
      }
      
      return result;
    } catch (error) {
      console.error('Error analyzing conversation:', error);
      
      // Default to not routing if analysis fails
      return {
        primaryIntent: 'unknown',
        domainIntent: 'general_chat',
        sentiment: 'neutral',
        routeToDomainAgent: false,
        confidence: 0
      };
    }
  }
  
  /**
   * Find the most appropriate agent for a domain intent
   * @param {string} domainIntent - The domain intent
   * @returns {Object} - The appropriate agent
   */
  findAppropriateAgent(domainIntent) {
    // Map domain intents to agents
    switch (domainIntent) {
      case 'goal_setting':
        return this.agents.find(a => a.getName() === 'GoalAgent');
      case 'task_management':
        return this.agents.find(a => a.getName() === 'TaskAgent');
      case 'fitness_health':
        return this.agents.find(a => a.getName() === 'FitnessAgent');
      case 'programming_technical':
        return this.agents.find(a => a.getName() === 'TechnicalAgent');
      default:
        return null;
    }
  }
  
  /**
   * Handle general conversation without specialized agents
   * @param {Array} messages - Message history with context
   * @param {string} userId - User ID
   * @param {Object} analysis - Conversation analysis
   * @returns {Promise<Object>} - AI response
   */
  async handleGeneralConversation(messages, userId, analysis) {
    this.debug('Handling with general conversation');
    
    try {
      // Add custom system prompt based on analysis
      const adjustedSystemPrompt = this.getAdjustedSystemPrompt(analysis);
      
      const generalMessages = [
        {
          role: 'system',
          content: adjustedSystemPrompt
        },
        ...messages
      ];
      
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: generalMessages,
        temperature: 0.7,
        max_tokens: 400
      });
      
      // Store the assistant's response in memory
      this.updateConversationMemory(userId, [completion.choices[0].message]);
      
      return {
        message: completion.choices[0].message,
        model: completion.model,
        usage: completion.usage,
        analysis: analysis
      };
    } catch (error) {
      console.error('Error in general conversation:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm sorry, I'm having trouble responding right now. Could you try again in a moment?"
        },
        model: 'error-fallback',
        usage: { total_tokens: 0 }
      };
    }
  }
  
  /**
   * Get adjusted system prompt based on analysis
   * @param {Object} analysis - Conversation analysis
   * @returns {string} - Adjusted system prompt
   */
  getAdjustedSystemPrompt(analysis) {
    let prompt = this.routerSystemPrompt;
    
    // Add sentiment-based adjustment
    if (analysis && analysis.sentiment) {
      switch (analysis.sentiment) {
        case 'positive':
          prompt += '\n\nThe user seems positive. Match their energy with an upbeat, encouraging tone.';
          break;
        case 'negative':
          prompt += '\n\nThe user seems frustrated or negative. Be supportive, patient, and empathetic.';
          break;
        case 'confused':
          prompt += '\n\nThe user seems confused. Be clear, direct, and offer additional clarification.';
          break;
      }
    }
    
    // Add intent-based guidance if not being routed
    if (analysis && analysis.primaryIntent && !analysis.routeToDomainAgent) {
      prompt += `\n\nThe user's primary intent appears to be: ${analysis.primaryIntent}. 
      Address this intent directly while maintaining a conversational flow.`;
    }
    
    return prompt;
  }
  
  /**
   * Update the conversation memory for a user
   * @param {string} userId - User ID
   * @param {Array} newMessages - New messages to add
   */
  updateConversationMemory(userId, newMessages) {
    if (!userId || !newMessages || !newMessages.length) return;
    
    // Initialize memory for this user if not exists
    if (!this.conversationMemory.has(userId)) {
      this.conversationMemory.set(userId, []);
    }
    
    // Get current memory
    const memory = this.conversationMemory.get(userId);
    
    // Filter out system messages
    const filteredMessages = newMessages.filter(m => m.role !== 'system');
    
    // Add new messages
    const updatedMemory = [...memory, ...filteredMessages];
    
    // Keep only up to limit
    if (updatedMemory.length > this.memoryLimit) {
      this.conversationMemory.set(
        userId, 
        updatedMemory.slice(updatedMemory.length - this.memoryLimit)
      );
    } else {
      this.conversationMemory.set(userId, updatedMemory);
    }
    
    this.debug('Updated conversation memory for user:', userId, 
      'Memory size:', this.conversationMemory.get(userId).length);
  }
  
  /**
   * Get contextual messages with memory
   * @param {string} userId - User ID
   * @param {Array} currentMessages - Current message batch
   * @returns {Array} - Messages with context
   */
  getContextualMessages(userId, currentMessages) {
    // If no memory for this user, return current messages
    if (!this.conversationMemory.has(userId)) {
      return currentMessages;
    }
    
    // Get memory
    const memory = this.conversationMemory.get(userId);
    
    // If empty memory, return current messages
    if (!memory || memory.length === 0) {
      return currentMessages;
    }
    
    // Create a memory summary
    const memoryContext = {
      role: 'system',
      content: `Recent conversation context:
${memory.slice(-5).map(m => 
  `${m.role.toUpperCase()}: ${
    typeof m.content === 'string' ? 
      (m.content.substring(0, 100) + (m.content.length > 100 ? '...' : '')) :
      'Content not available'
  }`
).join('\n')}

Remember this conversation context when responding to the user.`
    };
    
    // Return current messages with memory context
    return [memoryContext, ...currentMessages];
  }
  
  /**
   * Debug log if enabled
   * @param  {...any} args - Arguments to log
   */
  debug(...args) {
    if (this.enableDebug) {
      console.log('[ConversationRouter]', ...args);
    }
  }
}

module.exports = ConversationRouter;