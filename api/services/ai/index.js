const ConversationManager = require('./manager/ConversationManager');
const ServiceRegistry = require('./registry/ServiceRegistry');
const GoalService = require('./services/GoalService');
const TaskService = require('./services/TaskService');

/**
 * AI Service Factory
 * Creates and configures the AI services architecture
 */
class AIServiceFactory {
  /**
   * Create a new AI service instance
   * @returns {ConversationManager} - The configured conversation manager
   */
  static create() {
    // Create the service registry
    const registry = new ServiceRegistry();
    
    // Create specialized services
    const goalService = new GoalService();
    const taskService = new TaskService();
    
    // Register services
    registry.registerService(goalService);
    registry.registerService(taskService);
    
    // Create and return the conversation manager
    return new ConversationManager(registry);
  }
}

// Create the AI service
const aiService = AIServiceFactory.create();

module.exports = aiService;