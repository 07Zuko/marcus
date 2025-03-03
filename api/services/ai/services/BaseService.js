/**
 * Base AI Service
 * The foundation for all specialized AI services
 */
class BaseService {
  constructor(name) {
    this.name = name;
  }

  /**
   * Check if this service can handle the given request
   * @param {Array} messages - Message history 
   * @returns {Promise<boolean>} - Whether this service can handle the request
   */
  async canHandle(messages) {
    throw new Error('Not implemented: Each service must implement its own canHandle method');
  }

  /**
   * Process the request with this specialized service
   * @param {Array} messages - Message history
   * @param {string} userId - User ID for context
   * @returns {Promise<Object>} - Processing result
   */
  async process(messages, userId) {
    throw new Error('Not implemented: Each service must implement its own process method');
  }

  /**
   * Get the name of this service
   * @returns {string} - Service name
   */
  getName() {
    return this.name;
  }
}

module.exports = BaseService;