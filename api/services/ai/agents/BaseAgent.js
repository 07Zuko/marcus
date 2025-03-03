/**
 * Base Agent
 * 
 * Foundation class for all specialized domain agents in the multi-tier AI architecture.
 * Provides common functionality for conversation processing and implementation.
 */

class BaseAgent {
  /**
   * Create a new Base Agent
   * @param {string} name - Agent name 
   * @param {OpenAI} openai - OpenAI instance
   * @param {Object} implementer - Optional implementation tool
   */
  constructor(name, openai, implementer = null) {
    if (new.target === BaseAgent) {
      throw new Error('BaseAgent is an abstract class and cannot be instantiated directly');
    }
    
    this.name = name;
    this.openai = openai;
    this.implementer = implementer;
    
    // Default system prompt
    this.systemPrompt = '';
    
    // Debug logging
    this.enableDebug = true;
  }
  
  /**
   * Get the agent's name
   * @returns {string} - Agent name
   */
  getName() {
    return this.name;
  }
  
  /**
   * Process a conversation
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @param {Object} analysis - Conversation analysis
   * @returns {Promise<Object>} - AI response
   */
  async processConversation(messages, userId, analysis) {
    throw new Error('processConversation must be implemented by subclasses');
  }
  
  /**
   * Get completion from OpenAI
   * @param {Array} messages - Messages to send
   * @param {Object} options - Optional parameters
   * @returns {Promise<Object>} - OpenAI completion
   */
  async getCompletion(messages, options = {}) {
    const defaultOptions = {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      max_tokens: 500
    };
    
    const completionOptions = { ...defaultOptions, ...options };
    
    return this.openai.chat.completions.create({
      messages,
      ...completionOptions
    });
  }
  
  /**
   * Apply implementation with the implementer
   * @param {string} action - Action to perform
   * @param {Object} data - Data for the action
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Implementation result
   */
  async applyImplementation(action, data, userId) {
    if (!this.implementer) {
      this.debug('No implementer available for', action);
      return { success: false, error: 'No implementer available' };
    }
    
    try {
      return await this.implementer.execute(action, data, userId);
    } catch (error) {
      this.debug('Implementation error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Create a complete message set with system prompt
   * @param {Array} messages - User messages
   * @param {string} customPrompt - Optional custom system prompt
   * @returns {Array} - Complete message set
   */
  createMessageSet(messages, customPrompt = null) {
    return [
      {
        role: 'system',
        content: customPrompt || this.systemPrompt
      },
      ...messages
    ];
  }
  
  /**
   * Debug log if enabled
   * @param  {...any} args - Arguments to log
   */
  debug(...args) {
    if (this.enableDebug) {
      console.log(`[${this.name}]`, ...args);
    }
  }
}

module.exports = BaseAgent;