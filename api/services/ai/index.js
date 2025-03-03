/**
 * Enhanced AI Architecture Index
 * 
 * This module implements a multi-tiered AI architecture:
 * 
 * 1. Conversation Router - Top level AI that handles:
 *    - User sentiment analysis
 *    - Intent detection
 *    - Routing to appropriate domain agent
 * 
 * 2. Domain Agents - Specialized AIs for:
 *    - Goal Management
 *    - Task Management
 *    - Fitness & Health
 *    - Programming & Technical
 * 
 * 3. Implementation Layer - Tools for:
 *    - Database operations
 *    - Claude Code integration
 *    - Data validation
 */

const ConversationRouter = require('./router/ConversationRouter');
const OpenAI = require('openai');
const config = require('../../config');

// Domain Agents
const GoalAgent = require('./agents/GoalAgent');
const TaskAgent = require('./agents/TaskAgent');
const FitnessAgent = require('./agents/FitnessAgent');
const TechnicalAgent = require('./agents/TechnicalAgent');

// Implementation tools
const ClaudeCodeImplementer = require('./implementers/ClaudeCodeImplementer');
const DatabaseOperations = require('./implementers/DatabaseOperations');

/**
 * Enhanced AI Service Factory
 * Creates and configures the multi-tier AI architecture
 */
class EnhancedAIServiceFactory {
  /**
   * Create a new AI service instance with fluid conversation routing
   * @returns {ConversationRouter} - The configured conversation router
   */
  static create() {
    // Initialize shared OpenAI instance
    const openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true // Only for development
    });
    
    // Create the implementation layer
    const claudeCodeImplementer = new ClaudeCodeImplementer();
    const databaseOps = new DatabaseOperations();
    
    // Create the domain agents with implementation tools
    const goalAgent = new GoalAgent(openai, claudeCodeImplementer, databaseOps);
    const taskAgent = new TaskAgent(openai, claudeCodeImplementer, databaseOps);
    const fitnessAgent = new FitnessAgent(openai, claudeCodeImplementer, databaseOps);
    const technicalAgent = new TechnicalAgent(openai, claudeCodeImplementer);
    
    // Create and return the conversation router with all agents
    console.log("Creating enhanced multi-tier AI architecture with fluid conversation routing");
    return new ConversationRouter(
      openai, 
      [goalAgent, taskAgent, fitnessAgent, technicalAgent]
    );
  }
}

// Create the enhanced AI service
const aiService = EnhancedAIServiceFactory.create();

module.exports = aiService;