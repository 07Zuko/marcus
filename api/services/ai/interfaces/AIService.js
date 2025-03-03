/**
 * AI Service Interface
 * Base interface for all AI services in the Aurelius application
 */
class AIService {
  /**
   * Process a message with AI
   * @param {Array} messages - Array of message objects with role and content
   * @param {string} userId - User ID for context
   * @returns {Promise<Object>} - Promise resolving to AI response
   */
  async processMessage(messages, userId) {
    throw new Error('Method not implemented');
  }

  /**
   * Get the name of the service
   * @returns {string} - Service name
   */
  getServiceName() {
    throw new Error('Method not implemented');
  }

  /**
   * Check if the service can handle a specific intent
   * @param {string} intent - The intent to check
   * @returns {boolean} - True if the service can handle the intent
   */
  canHandleIntent(intent) {
    throw new Error('Method not implemented');
  }
  
  /**
   * Get the system prompt for this service
   * @returns {string} - The system prompt
   */
  getSystemPrompt() {
    throw new Error('Method not implemented');
  }
}

module.exports = AIService;