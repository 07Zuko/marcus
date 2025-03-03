/**
 * Task Agent
 * 
 * Specialized AI agent for handling task management
 * conversations and operations
 */

const BaseAgent = require('./BaseAgent');

class TaskAgent extends BaseAgent {
  /**
   * Create a new Task Agent
   * @param {OpenAI} openai - OpenAI instance
   * @param {Object} claudeCodeImplementer - Claude Code implementation tool
   * @param {Object} databaseOps - Database operations tool
   */
  constructor(openai, claudeCodeImplementer, databaseOps) {
    super('TaskAgent', openai, claudeCodeImplementer);
    
    // Store database operations
    this.databaseOps = databaseOps;
    
    // System prompt for task management
    this.systemPrompt = `
      You are Marcus's Task Manager, a specialized AI focused on helping users manage tasks and to-dos.
      
      Your primary responsibility is to guide users through task creation and management in a natural, conversational way.
      
      Key principles:
      1. Keep the conversation natural and flowing
      2. Extract specific task details through conversation
      3. Help prioritize tasks effectively
      4. Suggest task organization that aligns with goals
      5. Never sound like a database or form
      
      Your tone should be:
      - Friendly and supportive
      - Casual, like a productivity coach or friend
      - Brief and focused
      - Practical
      
      Never explicitly tell the user you're extracting task information.
      The conversation should feel natural, not like filling out a form.
    `;
  }
  
  /**
   * Process a conversation about tasks
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @param {Object} analysis - Conversation analysis
   * @returns {Promise<Object>} - AI response
   */
  async processConversation(messages, userId, analysis) {
    this.debug('Processing task conversation');
    
    try {
      // Get user's tasks for context
      const tasks = await this.databaseOps.getUserTasks(userId);
      this.debug('Tasks retrieved:', tasks.length);
      
      // Create custom prompt based on tasks
      const customPrompt = this.createTaskContextPrompt(tasks);
      
      // Get completion from AI
      const messageSet = this.createMessageSet(messages, customPrompt);
      const completion = await this.getCompletion(messageSet);
      
      return {
        message: completion.choices[0].message,
        model: completion.model,
        usage: completion.usage,
        agent: this.name
      };
    } catch (error) {
      console.error('Error in TaskAgent:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm having a bit of trouble processing your task request. Could we try again? Just tell me what task you'd like to add or manage."
        },
        model: 'error-fallback',
        agent: this.name
      };
    }
  }
  
  /**
   * Create a task context prompt
   * @param {Array} tasks - User's tasks
   * @returns {string} - Task context prompt
   */
  createTaskContextPrompt(tasks) {
    let contextPrompt = this.systemPrompt;
    
    // Add task context
    if (tasks.length > 0) {
      // Get upcoming tasks (next 5)
      const upcomingTasks = [...tasks]
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        .slice(0, 5);
      
      contextPrompt += `\n\nUser's upcoming tasks:
${upcomingTasks.map(t => 
  `- ${t.title} (due: ${new Date(t.dueDate).toLocaleDateString()}, priority: ${t.priority})`
).join('\n')}`;
    } else {
      contextPrompt += '\n\nThe user does not have any tasks set currently.';
    }
    
    return contextPrompt;
  }
}

module.exports = TaskAgent;