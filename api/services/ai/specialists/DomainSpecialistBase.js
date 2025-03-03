const BaseService = require('../services/BaseService');

/**
 * Domain Specialist Base Class
 * Base class for all domain-specific AI specialists in the multi-tier architecture
 */
class DomainSpecialistBase extends BaseService {
  constructor(name) {
    super(name);
    this.systemPrompt = '';
    this.intents = []; // Intents this specialist can handle
  }
  
  /**
   * Get confidence score for handling this request
   * @param {Array} messages - Message history
   * @returns {Promise<number>} - Confidence score between 0 and 1
   */
  async getConfidenceScore(messages) {
    // Default implementation returns 0
    // Specialists should override this with their own logic
    return 0;
  }
  
  /**
   * Get the system prompt for this specialist
   * @returns {string} - System prompt
   */
  getSystemPrompt() {
    return this.systemPrompt;
  }
  
  /**
   * Check if this specialist handles a specific intent
   * @param {string} intent - Intent to check
   * @returns {boolean} - Whether this specialist handles the intent
   */
  handlesIntent(intent) {
    return this.intents.includes(intent);
  }
  
  /**
   * Get the intents this specialist can handle
   * @returns {Array} - List of intents
   */
  getIntents() {
    return this.intents;
  }
}

module.exports = DomainSpecialistBase;