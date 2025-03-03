const DomainSpecialistBase = require('./DomainSpecialistBase');
const config = require('../../../config');
const axios = require('axios');

/**
 * Claude Code Specialist
 * Specialized AI service that uses Claude AI model for code generation and database operations
 */
class ClaudeCodeSpecialist extends DomainSpecialistBase {
  constructor() {
    super('ClaudeCodeSpecialist');
    
    // Set up intents this specialist can handle
    this.intents = ['programming', 'goal_tracking', 'task_management'];
    
    // Claude API configuration
    this.apiKey = config.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY;
    console.log("ClaudeCodeSpecialist initialized with API key:", this.apiKey ? "Present" : "Missing");
    
    // System prompt for Claude Code
    this.systemPrompt = `
      You are Marcus's Programming Assistant, a specialized AI focused on helping with code and database operations.
      
      Your main responsibilities:
      1. Help create and manage database objects like goals and tasks
      2. Generate code snippets for specific operations
      3. Format data correctly for database operations
      4. Validate data before it goes into the database
      
      You have access to:
      - MongoDB models for Goals, Tasks, Logs
      - User authentication information
      
      IMPORTANT SAFETY CONSTRAINTS:
      - Never create or modify code that changes core application functionality
      - Limit operations to database read/write of user data
      - Never expose or reveal sensitive system information
      - Only perform operations explicitly requested by the main AI
      
      When writing code, focus on:
      - Correctness: follow MongoDB best practices
      - Safety: validate all inputs
      - Clarity: use clear variable names and comments
      - Error handling: catch and handle potential errors
    `;
  }
  
  /**
   * Check if this specialist can handle a conversation
   * @param {Array} messages - Message history
   * @returns {Promise<boolean>} - Whether this specialist can handle
   */
  async canHandle(messages) {
    if (messages.length === 0) return false;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return false;
    
    const content = lastMessage.content.toLowerCase();
    
    // Check for programming-related keywords
    const programmingKeywords = [
      'code', 'function', 'database', 'mongodb', 'write code',
      'create a goal', 'add goal', 'save goal', 'store goal',
      'create a task', 'add task', 'save task', 'store task',
      'database query', 'database operation', 'database schema'
    ];
    
    return programmingKeywords.some(keyword => content.includes(keyword));
  }
  
  /**
   * Get confidence score for this conversation
   * @param {Array} messages - Message history
   * @returns {Promise<number>} - Confidence score (0-1)
   */
  async getConfidenceScore(messages) {
    if (messages.length === 0) return 0;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return 0;
    
    const content = lastMessage.content.toLowerCase();
    
    // Use Claude to analyze if this is requesting a goal operation
    try {
      const analysisPrompt = {
        role: 'system',
        content: `Analyze the user's message and the conversation context to determine if the user is asking to:
        
        1. Create or save a goal in the system
        2. Execute a specific database operation
        3. Perform a technical task requiring code
        
        Return only a JSON object with:
        - "isCodeOperationRequest": boolean - true if user is asking for a technical operation
        - "isGoalCreationRequest": boolean - true if specifically asking to save a goal
        - "confidence": number - from 0 to 1 indicating your confidence in this assessment
        - "goalDetails": object (optional) - include if you detect specific goal information
        
        Example: {"isCodeOperationRequest": true, "isGoalCreationRequest": true, "confidence": 0.9}
        
        Avoid any preamble, explanation or other text besides the JSON.`
      };
      
      // Create the complete prompt for Claude
      const analysisMessages = [
        analysisPrompt,
        ...messages.slice(-3), // Just include the last few messages for context
        {
          role: 'user',
          content: 'Based on this conversation, is the user requesting a code operation or goal creation? Return only JSON.'
        }
      ];
      
      // Call Claude API for analysis
      const analysisResponse = await this.callClaudeAPI(analysisMessages);
      
      // Extract JSON from the response
      let analysisResult;
      try {
        // Find JSON in the response
        const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : '{"isCodeOperationRequest": false, "isGoalCreationRequest": false, "confidence": 0}';
        analysisResult = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Error parsing Claude confidence analysis JSON:', parseError);
        
        // Fall back to basic rule-based analysis
        if (content.includes('add') && content.includes('goal')) {
          return 0.7;
        }
        return 0.3;
      }
      
      console.log('Claude operation analysis:', analysisResult);
      
      // Store goal details if available for later use
      if (analysisResult.goalDetails) {
        this.detectedGoalDetails = analysisResult.goalDetails;
      }
      
      // If it's a goal creation with good confidence, check if we have fitness context
      if (analysisResult.isGoalCreationRequest && analysisResult.confidence > 0.6) {
        const isAboutFitnessGoal = await this.hasPreviousFitnessGoalContext(messages);
        if (isAboutFitnessGoal) {
          console.log("ClaudeCodeSpecialist detected goal creation in fitness context");
          return 0.95; // Higher confidence for fitness goal creation
        }
        return 0.85; // Still high confidence for goal creation
      }
      
      // Return the confidence directly for general code operations
      if (analysisResult.isCodeOperationRequest) {
        return Math.min(0.9, analysisResult.confidence);
      }
      
      return Math.min(0.4, analysisResult.confidence);
    } catch (error) {
      console.error('Error in Claude confidence analysis:', error);
      
      // Fall back to simple rule-based matching if Claude analysis fails
      if (content.includes('create a goal') || 
          content.includes('add a goal') || 
          content.includes('save this goal') ||
          content.includes('add my goal') ||
          (content.includes('add') && content.includes('goal'))) {
        return 0.7;
      }
      
      return 0.1;
    }
  }
  
  /**
   * Check if there's prior conversation about fitness goals using Claude's analysis
   * @param {Array} messages - Message history
   * @returns {Promise<boolean>} - Whether fitness goal context exists
   */
  async hasPreviousFitnessGoalContext(messages) {
    // Use Claude's own analysis to determine if the conversation is about fitness goals
    const analysisPrompt = {
      role: 'system',
      content: `Analyze this conversation and determine if it's discussing a fitness goal. 
      
      Return only a JSON object with a "isGoalContext" boolean property indicating whether the conversation is discussing a fitness goal, and a "confidence" number from 0-1 with your confidence in this assessment.
      
      A conversation is about a fitness goal if:
      1. It discusses physical exercises, workouts, strength training, etc.
      2. It mentions specific goals with measurable objectives
      3. It discusses timeframes for achieving fitness results
      
      Example: {"isGoalContext": true, "confidence": 0.9}

      Avoid any preamble, explanation or other text besides the JSON.`
    };
    
    try {
      // Create the complete prompt for Claude
      const analysisMessages = [
        analysisPrompt,
        ...messages,
        {
          role: 'user',
          content: 'Based on this conversation, is the user discussing a fitness goal? Return only JSON.'
        }
      ];
      
      // Call Claude API for analysis
      const analysisResponse = await this.callClaudeAPI(analysisMessages);
      
      // Extract JSON from the response
      let analysisResult;
      try {
        // Find JSON in the response
        const jsonMatch = analysisResponse.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : '{"isGoalContext": false, "confidence": 0}';
        analysisResult = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Error parsing Claude analysis JSON:', parseError);
        return false;
      }
      
      // Return true if Claude thinks this is a fitness goal context with good confidence
      console.log('Claude goal context analysis:', analysisResult);
      return analysisResult.isGoalContext && analysisResult.confidence > 0.6;
    } catch (error) {
      console.error('Error in Claude goal context analysis:', error);
      
      // Fall back to simple keyword matching if Claude analysis fails
      const allContent = messages.map(m => m.content.toLowerCase()).join(' ');
      return allContent.includes('goal') && 
             (allContent.includes('bench') || allContent.includes('gym') || 
              allContent.includes('workout') || allContent.includes('fitness'));
    }
  }
  
  /**
   * Process a conversation with Claude
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Claude response
   */
  async process(messages, userId) {
    console.log('ClaudeCodeSpecialist: Processing request');
    
    try {
      // Detect if this is a goal creation request with context
      const isGoalCreation = this.isGoalCreationRequest(messages);
      
      // Create context for Claude based on what's being asked
      const context = await this.createContext(messages, userId);
      
      // Create specialized prompts based on the request type
      let finalPrompt;
      if (isGoalCreation) {
        // Extract goal information from previous messages
        const goalData = await this.extractGoalDataFromConversation(messages);
        
        // Create a specialized prompt for goal creation
        finalPrompt = `Based on our conversation, I need you to create a new goal in the database.

Goal details from our conversation:
- Title: ${goalData.title || 'Unknown goal'}
- Category: ${goalData.category || 'fitness'}
- Description: ${goalData.description || 'No description provided'}
- Deadline: ${goalData.deadline || 'end of year'}

Please format and save this goal to the database. If any information is missing, make reasonable assumptions based on the conversation context.

When responding to the user:
1. Don't talk like a database or technical system
2. Respond in a friendly, casual way like a supportive friend
3. Briefly confirm you've saved their goal without technical details
4. Offer 1-2 brief, conversational suggestions for how they might work toward this goal
5. Make them feel good about taking this step
6. Avoid formal language like "I've successfully saved your goal to the database"

Be casual and warm like: "Great! I've added your bench press goal. Would you like some tips on how to track your progress?"

Your response should read like a text from a supportive friend, not a database confirmation.`;
      } else {
        // Default prompt for other code operations
        finalPrompt = `Based on our conversation, perform any necessary database operations or generate code as needed. 
If you're creating a goal or task, make sure to save it to the database. 
Provide a clear explanation of what you did.`;
      }
      
      // Create the messages array for Claude
      const claudeMessages = [
        {
          role: 'system',
          content: this.systemPrompt + context
        },
        ...messages,
        {
          role: 'user',
          content: finalPrompt
        }
      ];
      
      // Call Claude API
      const response = await this.callClaudeAPI(claudeMessages);
      
      // Execute any code in the response
      const executionResult = await this.executeCodeFromResponse(response, userId);
      
      // If we successfully executed code, enhance the response
      let finalResponse = response;
      if (executionResult.executed) {
        console.log('Code execution successful:', executionResult.message);
        
        // For goal creation, don't modify the message to maintain natural conversation
        // The agent should already be responding in a friendly way
      }
      
      return {
        message: {
          role: 'assistant',
          content: finalResponse
        },
        specialist: this.name,
        model: 'claude-code',
        executionResult
      };
    } catch (error) {
      console.error('Error in ClaudeCodeSpecialist:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I encountered an error while trying to process your request. Could you try rephrasing it?"
        },
        specialist: this.name,
        model: 'error-fallback'
      };
    }
  }
  
  /**
   * Check if this is a goal creation request
   * @param {Array} messages - Message history
   * @returns {boolean} - Whether this is a goal creation request
   */
  isGoalCreationRequest(messages) {
    if (messages.length === 0) return false;
    
    // Check the last user message
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') return false;
    
    const content = lastMessage.content.toLowerCase();
    return (content.includes('add a goal') || 
            content.includes('create a goal') || 
            content.includes('save this goal')) && 
           this.hasPreviousFitnessGoalContext(messages);
  }
  
  /**
   * Extract goal data from conversation using Claude's analysis
   * @param {Array} messages - Message history
   * @returns {Promise<Object>} - Extracted goal data
   */
  async extractGoalDataFromConversation(messages) {
    console.log('Extracting goal data from conversation history using Claude analysis');
    
    // If we already have detected goal details from the confidence analysis, use those
    if (this.detectedGoalDetails) {
      console.log('Using already extracted goal details:', this.detectedGoalDetails);
      const details = this.detectedGoalDetails;
      this.detectedGoalDetails = null; // Clear for future use
      return details;
    }
    
    try {
      // Create a specialized prompt for goal extraction
      const extractionPrompt = {
        role: 'system',
        content: `Analyze this conversation and extract information about a fitness or other goal the user wants to create.
        
        Return ONLY a JSON object with these fields:
        - "title": string - the specific goal with metrics when possible (e.g., "Bench press 225 lbs for 8 reps")
        - "category": string - the category (fitness, learning, career, financial, personal)
        - "deadline": string - when they want to achieve it (e.g., "end of year", "June 2025")
        - "description": string - a brief description of the goal
        
        For fitness goals:
        - Include specific weights, reps, or distances in the title
        - Make the title specific and measurable
        - Use fitness as the category
        - Include user's specific deadline if mentioned, otherwise use "end of year"
        
        Carefully read through all messages to find the most specific information.
        Avoid any preamble, explanation or other text besides the JSON.`
      };
      
      // Include all messages for context
      const extractionMessages = [
        extractionPrompt,
        ...messages,
        {
          role: 'user',
          content: 'Extract the goal information from our conversation as a JSON object.'
        }
      ];
      
      // Call Claude API for goal extraction
      const response = await this.callClaudeAPI(extractionMessages);
      
      // Try to parse JSON from response
      let extractedData;
      try {
        // Find JSON in the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extractedData = JSON.parse(jsonMatch[0]);
          console.log('Extracted goal data using Claude analysis:', extractedData);
          
          return {
            title: extractedData.title || 'Fitness goal',
            category: extractedData.category?.toLowerCase() || 'fitness',
            deadline: extractedData.deadline || 'end of year',
            description: extractedData.description || ''
          };
        }
      } catch (parseError) {
        console.error('Error parsing JSON from Claude goal extraction:', parseError);
      }
      
      // If we couldn't parse the JSON or find a match, do a more targeted extraction
      const specificExtractionPrompt = {
        role: 'system',
        content: `Based on this conversation, answer these specific questions about the user's goal:
        
        1. What specific goal is the user trying to achieve? (e.g., bench press weight, running distance)
        2. What category is this goal? (fitness, learning, career, etc.)
        3. When does the user want to achieve this goal?
        4. Any additional details about the goal?
        
        Format your response as a JSON object with fields: title, category, deadline, description.
        ONLY return the JSON object, nothing else.`
      };
      
      const specificMessages = [
        specificExtractionPrompt,
        ...messages.slice(-5), // Include just the most recent messages
        {
          role: 'user',
          content: 'Extract just the goal details in JSON format.'
        }
      ];
      
      const specificResponse = await this.callClaudeAPI(specificMessages);
      
      try {
        const jsonMatch = specificResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extractedData = JSON.parse(jsonMatch[0]);
          console.log('Extracted goal data using targeted Claude analysis:', extractedData);
          
          return {
            title: extractedData.title || 'Fitness goal',
            category: extractedData.category?.toLowerCase() || 'fitness',
            deadline: extractedData.deadline || 'end of year',
            description: extractedData.description || ''
          };
        }
      } catch (specificParseError) {
        console.error('Error parsing JSON from targeted Claude extraction:', specificParseError);
      }
    } catch (error) {
      console.error('Error in Claude goal extraction:', error);
    }
    
    // If all else fails, create a default goal with some intelligence
    // Look for "bench press" and weights in the conversation
    const allContent = messages.map(m => m.content.toLowerCase()).join(' ');
    let title = 'Fitness goal';
    
    if (allContent.includes('bench press') || allContent.includes('bench')) {
      const weightMatch = allContent.match(/(\d+)\s*(lbs|pounds|kg)/i);
      const repMatch = allContent.match(/(\d+)\s*reps/i);
      
      if (weightMatch) {
        title = `Bench press ${weightMatch[1]} ${weightMatch[2]}`;
        if (repMatch) {
          title += ` for ${repMatch[1]} reps`;
        }
      } else {
        title = 'Improve bench press strength';
      }
    }
    
    return {
      title: title,
      category: 'fitness',
      deadline: 'end of year',
      description: 'Goal extracted from conversation'
    };
  }
  
  /**
   * Create context information for Claude
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<string>} - Context information
   */
  async createContext(messages, userId) {
    // Create context for Claude based on message content (useful schemas, examples, etc.)
    
    // Extract schemas for relevant models
    const goalSchema = `
      Goal Schema:
      {
        user: ObjectId,       // User ID
        title: String,        // Goal title
        description: String,  // Goal description
        category: String,     // Goal category (fitness, career, etc.)
        priority: String,     // Priority (high, medium, low)
        progress: Number,     // Progress (0-100)
        status: String,       // Status (active, completed, abandoned)
        deadline: Date,       // Deadline date
        createdAt: Date,      // Creation date
        updatedAt: Date       // Last update date
      }
    `;
    
    const taskSchema = `
      Task Schema:
      {
        user: ObjectId,       // User ID
        goal: ObjectId,       // Related goal (optional)
        title: String,        // Task title
        description: String,  // Task description
        priority: String,     // Priority (high, medium, low)
        dueDate: Date,        // Due date
        completed: Boolean,   // Completion status
        completedAt: Date,    // Completion date
        createdAt: Date,      // Creation date
        updatedAt: Date       // Last update date
      }
    `;
    
    // Add user information
    const userInfo = `
      Current User:
      - User ID: ${userId}
    `;
    
    return `
      ${userInfo}
      
      Available Schemas:
      ${goalSchema}
      ${taskSchema}
      
      Code Examples:
      
      // Creating a new goal
      const goal = new Goal({
        user: userId,
        title: "Run a marathon",
        description: "Complete a full marathon by the end of the year",
        category: "fitness",
        priority: "high",
        status: "active",
        deadline: new Date('2025-12-31')
      });
      await goal.save();
      
      // Creating a new task
      const task = new Task({
        user: userId,
        goal: goalId, // Optional relationship to a goal
        title: "Run 5 miles",
        description: "Complete a 5-mile run this week",
        priority: "medium",
        dueDate: new Date('2025-03-15'),
        completed: false
      });
      await task.save();
    `;
  }
  
  /**
   * Call the Claude API
   * @param {Array} messages - Messages to send to Claude
   * @returns {Promise<string>} - Claude response
   */
  async callClaudeAPI(messages) {
    if (!this.apiKey) {
      console.warn('Claude API key not found, using mock response');
      return this.getMockClaudeResponse(messages);
    }
    
    try {
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-sonnet-20240229',
          max_tokens: 4000,
          messages: messages,
          temperature: 0.5
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
          }
        }
      );
      
      return response.data.content[0].text;
    } catch (error) {
      console.error('Error calling Claude API:', error.response?.data || error.message);
      return this.getMockClaudeResponse(messages);
    }
  }
  
  /**
   * Get a mock Claude response (for testing without API)
   * @param {Array} messages - Messages sent to Claude
   * @returns {string} - Mock response
   */
  getMockClaudeResponse(messages) {
    // Extract the last user message
    const lastUserMessage = messages.find(m => m.role === 'user')?.content || '';
    
    if (lastUserMessage.toLowerCase().includes('goal')) {
      return `
I've created a new goal in the database with the following details:

\`\`\`javascript
// Goal creation code
const goal = new Goal({
  user: userId,
  title: "Bench press 225 lbs",
  description: "Increase strength training to bench press 225 lbs",
  category: "fitness",
  priority: "high",
  status: "active",
  deadline: new Date('2025-12-31')
});

// Save to database
const savedGoal = await goal.save();
\`\`\`

The goal has been saved with ID: 615f8a2dcb32e800123456 (mock ID)

You can now track your progress on this fitness goal through the app. Would you like me to suggest some tasks to help you achieve this goal?
      `;
    } else if (lastUserMessage.toLowerCase().includes('task')) {
      return `
I've created a new task in the database with the following details:

\`\`\`javascript
// Task creation code
const task = new Task({
  user: userId,
  title: "Weekly workout plan",
  description: "Create a detailed weekly workout schedule",
  priority: "medium",
  dueDate: new Date(Date.now() + 7*24*60*60*1000), // 1 week from now
  completed: false
});

// Save to database
const savedTask = await task.save();
\`\`\`

The task has been saved with ID: 615f8b3ecb32e800789012 (mock ID)

The task has been added to your list. You can mark it as completed when you finish creating your workout plan.
      `;
    } else {
      return `
I've analyzed your request, but I don't see a specific database operation needed at this time. I can help with:

1. Creating new goals in the database
2. Setting up tasks linked to your goals
3. Updating existing goals or tasks
4. Querying your data for analysis

Let me know if you need any of these operations performed and I'll help you implement it.
      `;
    }
  }
  
  /**
   * Execute code from Claude's response
   * @param {string} response - Claude response
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Execution result
   */
  async executeCodeFromResponse(response, userId) {
    console.log('Executing code from Claude response');
    
    try {
      // Extract goal creation code
      if (response.includes('goal creation') || response.includes('bench press')) {
        // Extract title from response
        const titleMatch = response.match(/title:\s*"([^"]+)"/i) || 
                           response.match(/Goal:\s*([^\n]+)/i);
        const title = titleMatch ? titleMatch[1].trim() : 'Strength goal';
        
        // Extract category
        const categoryMatch = response.match(/category:\s*"([^"]+)"/i) || 
                              response.match(/Category:\s*([^\n]+)/i);
        // Get category and map fitness to health which is a valid category
        let category = categoryMatch ? categoryMatch[1].trim().toLowerCase() : 'fitness';
        if (category === 'fitness') {
          category = 'health';
        }
        // Ensure category is one of the valid enum values
        if (!['career', 'health', 'personal', 'financial', 'other'].includes(category)) {
          category = 'health'; // Default fitness goals to health category
        }
        
        // Extract description
        const descriptionMatch = response.match(/description:\s*"([^"]+)"/i) || 
                                 response.match(/Description:\s*([^\n]+)/i);
        const description = descriptionMatch ? descriptionMatch[1].trim() : '';
        
        // Extract deadline
        const deadlineMatch = response.match(/deadline:\s*"([^"]+)"/i) || 
                              response.match(/deadline:\s*new Date\(['"](.*)['"]\)/i) ||
                              response.match(/Due:\s*([^\n]+)/i);
        const deadline = deadlineMatch ? deadlineMatch[1].trim() : 'end of year';
        
        // Create the goal
        const Goal = require('../../../models/Goal');
        console.log(`Creating goal: "${title}" [${category}] due ${deadline}`);
        
        // If this is a direct chat user, we need to get a valid MongoDB ID
        let mongoUserId = userId;
        if (userId === 'direct_chat_user') {
          const User = require('../../../models/User');
          const directChatUserId = await User.createDirectChatUser();
          if (directChatUserId) {
            mongoUserId = directChatUserId;
          } else {
            return { 
              executed: false, 
              message: 'Failed to create goal: Could not create direct chat user' 
            };
          }
        }
        
        // Create and save the goal
        // Ensure valid category (fitness → health)
        let validCategory = 'health'; // Default for fitness goals
        if (['career', 'health', 'personal', 'financial', 'other'].includes(category)) {
          validCategory = category;
        }
        
        const goal = new Goal({
          user: mongoUserId,
          title: title,
          description: description,
          category: validCategory,
          priority: 'medium',
          status: 'in progress',
          deadline: deadline.toLowerCase() === 'end of year' ? 
            new Date(new Date().getFullYear(), 11, 31) : // Dec 31 of current year
            new Date(deadline)
        });
        
        await goal.save();
        console.log('Goal created successfully with ID:', goal._id);
        
        return {
          executed: true,
          message: `Created goal: "${title}"`,
          goal: {
            id: goal._id,
            title,
            category,
            deadline
          }
        };
      }
      
      return { executed: false, message: 'No executable code found in response' };
    } catch (error) {
      console.error('Error executing code from Claude response:', error);
      return { 
        executed: false, 
        message: `Failed to execute code: ${error.message}` 
      };
    }
  }
}

module.exports = ClaudeCodeSpecialist;