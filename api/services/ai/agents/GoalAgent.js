/**
 * Goal Agent
 * 
 * Specialized AI agent for handling all goal-related conversations
 * and interactions - from creation to tracking.
 */

const BaseAgent = require('./BaseAgent');

class GoalAgent extends BaseAgent {
  /**
   * Create a new Goal Agent
   * @param {OpenAI} openai - OpenAI instance
   * @param {Object} claudeCodeImplementer - Claude Code implementation tool
   * @param {Object} databaseOps - Database operations tool
   */
  constructor(openai, claudeCodeImplementer, databaseOps) {
    super('GoalAgent', openai, claudeCodeImplementer);
    
    // Store database operations
    this.databaseOps = databaseOps;
    
    // Define conversation states
    this.STATES = {
      INQUIRY: 'inquiry',           // User asking about goals or process
      CREATION: 'creation',         // Starting goal creation
      REFINING: 'refining',         // Refining goal details
      CONFIRMING: 'confirming',     // Confirming goal before saving
      FEEDBACK: 'feedback'          // Providing feedback after creation
    };
    
    // System prompt for goal handling
    this.systemPrompt = `
      You are Marcus's Goal Coach, a specialized AI focused on helping users create and manage goals.
      
      Your primary responsibility is to guide users through goal setting in a natural, conversational way.
      
      Key principles:
      1. Keep the conversation natural and flowing
      2. Extract specific goal details gradually through conversation
      3. Help refine vague goals into specific, measurable objectives
      4. Be supportive and encouraging
      5. Never sound like a form or database
      
      For fitness goals particularly:
      - Ask about specific metrics (weight, reps, time)
      - Help establish realistic timeframes
      - Convert general desires ("get stronger") into measurable outcomes
      
      Valid goal categories are: health, career, personal, financial, other
      Note: All fitness goals should use the "health" category.
      
      Your tone should be:
      - Friendly and supportive
      - Casual, like a friend (not corporate)
      - Encouraging but realistic
      - Brief and focused
      
      Never explicitly tell the user you're extracting goal information or transitioning between states.
      The conversation should feel like chatting with a coach, not filling out a form.
    `;
  }
  
  /**
   * Process a goal-related conversation
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @param {Object} analysis - Conversation analysis
   * @returns {Promise<Object>} - AI response
   */
  async processConversation(messages, userId, analysis) {
    this.debug('Processing goal conversation');
    
    try {
      // Determine conversation state
      const state = await this.determineConversationState(messages);
      this.debug('Determined conversation state:', state);
      
      // Handle based on state
      switch (state) {
        case this.STATES.CREATION:
          return await this.handleGoalCreation(messages, userId);
        case this.STATES.REFINING:
          return await this.handleGoalRefining(messages, userId);
        case this.STATES.CONFIRMING:
          return await this.handleGoalConfirmation(messages, userId);
        case this.STATES.FEEDBACK:
          return await this.handleGoalFeedback(messages, userId);
        case this.STATES.INQUIRY:
        default:
          return await this.handleGoalInquiry(messages, userId);
      }
    } catch (error) {
      console.error('Error in GoalAgent:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm having some trouble processing your goal request. Could we try again? Just tell me what you'd like to accomplish."
        },
        model: 'error-fallback',
        agent: this.name
      };
    }
  }
  
  /**
   * Determine the current conversation state
   * @param {Array} messages - Message history
   * @returns {Promise<string>} - Conversation state
   */
  async determineConversationState(messages) {
    try {
      const analysisPrompt = `
        Analyze this conversation to determine what stage we're at in the goal-setting process.
        
        Stages:
        - inquiry: User is asking about goals or how to set them; no specific goal mentioned
        - creation: User has mentioned a goal they want to achieve but with few details
        - refining: We're discussing specific details of a goal (metrics, timeline)
        - confirming: We're confirming that all details are correct before saving
        - feedback: The goal has been set, and we're providing feedback
        
        Return ONLY a JSON with a "state" field containing exactly one of the stages above.
        Include a "confidence" field with a number from 0-1.
      `;
      
      const analysisMessages = [
        { role: 'system', content: analysisPrompt },
        ...messages.slice(-8), // Consider recent context
        { role: 'user', content: 'Which stage is this conversation in? Return only JSON.' }
      ];
      
      const completion = await this.getCompletion(analysisMessages, { 
        temperature: 0.3,
        max_tokens: 150,
        response_format: { type: 'json_object' }
      });
      
      const result = JSON.parse(completion.choices[0].message.content);
      this.debug('State analysis result:', result);
      
      // Validate the returned state
      if (result.state && this.STATES[result.state.toUpperCase()]) {
        return result.state;
      }
      
      // Default to inquiry if invalid or low confidence
      return this.STATES.INQUIRY;
    } catch (error) {
      console.error('Error determining conversation state:', error);
      return this.STATES.INQUIRY;
    }
  }
  
  /**
   * Handle general goal inquiries
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - AI response
   */
  async handleGoalInquiry(messages, userId) {
    this.debug('Handling goal inquiry');
    
    // Get current goals from database for context
    const userGoals = await this.databaseOps.getUserGoals(userId);
    
    // Customize prompt for inquiry handling
    const inquiryPrompt = `
      ${this.systemPrompt}
      
      The user is inquiring about goals. Be helpful in explaining how to set effective goals.
      
      ${userGoals.length > 0 ? `User's current goals:
      ${userGoals.map(g => `- ${g.title} (${g.category}, ${g.status})`).join('\n')}` : 
      'The user does not have any goals set currently.'}
      
      Your response should:
      1. Directly answer their question about goals
      2. Be encouraging and supportive
      3. Keep it brief - 2-3 sentences unless they asked for detailed guidance
    `;
    
    const messageSet = this.createMessageSet(messages, inquiryPrompt);
    const completion = await this.getCompletion(messageSet);
    
    return {
      message: completion.choices[0].message,
      model: completion.model,
      usage: completion.usage,
      agent: this.name,
      state: this.STATES.INQUIRY
    };
  }
  
  /**
   * Handle initial goal creation
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - AI response
   */
  async handleGoalCreation(messages, userId) {
    this.debug('Handling goal creation');
    
    // Extract initial goal information
    const goalInfo = await this.extractGoalInformation(messages);
    this.debug('Extracted goal info:', goalInfo);
    
    // Determine what information is missing
    const missingInfo = this.identifyMissingGoalInfo(goalInfo);
    
    // Customize prompt based on the information state
    const creationPrompt = `
      ${this.systemPrompt}
      
      The user has expressed interest in creating a goal: "${goalInfo.title || 'Unspecified goal'}"
      
      Current goal information:
      ${Object.entries(goalInfo)
        .filter(([key, value]) => value && key !== 'confidence')
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')}
      
      ${missingInfo.length > 0 ? `Missing information: ${missingInfo.join(', ')}
      
      In your response:
      1. Acknowledge their goal in a positive, supportive way
      2. Ask about ONE missing detail in a conversational way
      3. Don't make it feel like a form - keep it natural
      4. Don't list what's missing or mention "missing information"
      
      For example, instead of "What is your deadline?", ask "When are you hoping to achieve this by?" in a natural way.` :
      
      `All necessary information is provided. In your response:
      1. Reflect back the goal details in a natural way
      2. Ask if they'd like to save this goal
      3. Mention any quick tips related to achieving this specific goal`}
      
      Remember: Your response should read like a text from a supportive friend, not a database form.
    `;
    
    const messageSet = this.createMessageSet(messages, creationPrompt);
    const completion = await this.getCompletion(messageSet);
    
    // Store partial goal information in response for subsequent calls
    return {
      message: completion.choices[0].message,
      model: completion.model,
      usage: completion.usage,
      agent: this.name,
      state: missingInfo.length > 0 ? this.STATES.CREATION : this.STATES.CONFIRMING,
      goalInfo: goalInfo
    };
  }
  
  /**
   * Handle refining goal details
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - AI response
   */
  async handleGoalRefining(messages, userId) {
    this.debug('Handling goal refining');
    
    // Extract updated goal information
    const goalInfo = await this.extractGoalInformation(messages);
    this.debug('Refined goal info:', goalInfo);
    
    // Identify any remaining missing information
    const missingInfo = this.identifyMissingGoalInfo(goalInfo);
    
    // Customize prompt based on what's still needed
    const refiningPrompt = `
      ${this.systemPrompt}
      
      You're helping refine the user's goal: "${goalInfo.title || 'Unspecified goal'}"
      
      Current goal information:
      ${Object.entries(goalInfo)
        .filter(([key, value]) => value && key !== 'confidence')
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')}
      
      ${missingInfo.length > 0 ? `Still need: ${missingInfo.join(', ')}
      
      In your response:
      1. Acknowledge the information they just provided
      2. Ask about ONE remaining detail in a conversational way
      3. Keep it natural and flowing, not like filling out a form
      
      For example, if deadline is missing, you might say "That sounds great! When are you hoping to achieve this by?"` :
      
      `All necessary details are now available. In your response:
      1. Summarize the complete goal in a natural way
      2. Ask if they'd like to save this goal
      3. Be encouraging about their choice of goal`}
    `;
    
    const messageSet = this.createMessageSet(messages, refiningPrompt);
    const completion = await this.getCompletion(messageSet);
    
    // Set next state based on missing info
    const nextState = missingInfo.length > 0 ? 
      this.STATES.REFINING : 
      this.STATES.CONFIRMING;
    
    return {
      message: completion.choices[0].message,
      model: completion.model,
      usage: completion.usage,
      agent: this.name,
      state: nextState,
      goalInfo: goalInfo
    };
  }
  
  /**
   * Handle goal confirmation before saving
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - AI response
   */
  async handleGoalConfirmation(messages, userId) {
    this.debug('Handling goal confirmation, userId:', userId);
    
    // Extract final goal information
    const goalInfo = await this.extractGoalInformation(messages);
    this.debug('Final goal info for confirmation:', goalInfo);
    
    // Check if this message contains a confirmation
    const isConfirmed = await this.checkForConfirmation(messages);
    this.debug('Confirmation check:', isConfirmed);
    
    if (isConfirmed) {
      // User confirmed, save the goal
      // Make sure we pass the userId properly
      const goalToSave = this.prepareGoalForSaving(goalInfo);
      this.debug('Prepared goal for saving:', goalToSave);
      
      const result = await this.implementer.execute('saveGoal', {
        goal: goalToSave,
        userId: userId
      });
      
      this.debug('Goal save result:', result);
      
      if (result.success) {
        // Goal created successfully, provide feedback
        return await this.handleGoalFeedback(messages, userId, goalInfo, result.goal);
      } else {
        // Handle error in goal creation
        console.error('Error saving goal:', result.error);
        
        const errorPrompt = `
          ${this.systemPrompt}
          
          There was an error saving the goal: ${result.error || 'Unknown error'}
          
          In your response:
          1. Apologize for the issue in a natural way
          2. Suggest trying again or modifying some details
          3. Stay positive and supportive
        `;
        
        const messageSet = this.createMessageSet(messages, errorPrompt);
        const completion = await this.getCompletion(messageSet);
        
        return {
          message: completion.choices[0].message,
          model: completion.model,
          usage: completion.usage,
          agent: this.name,
          state: this.STATES.REFINING,
          error: result.error
        };
      }
    } else {
      // Still waiting for confirmation, ask naturally
      const confirmPrompt = `
        ${this.systemPrompt}
        
        You have all the information for the user's goal: "${goalInfo.title}"
        
        Goal details:
        ${Object.entries(goalInfo)
          .filter(([key, value]) => value && key !== 'confidence')
          .map(([key, value]) => `- ${key}: ${value}`)
          .join('\n')}
        
        The user hasn't confirmed they want to save this goal yet. In your response:
        1. Summarize the goal in a conversational way
        2. Ask if they'd like to save this goal to their account
        3. Be brief and natural - don't make it sound like a database operation
        
        For example: "So your goal is to bench press 225 lbs by the end of summer. Should I add this to your goals?"
      `;
      
      const messageSet = this.createMessageSet(messages, confirmPrompt);
      const completion = await this.getCompletion(messageSet);
      
      return {
        message: completion.choices[0].message,
        model: completion.model,
        usage: completion.usage,
        agent: this.name,
        state: this.STATES.CONFIRMING,
        goalInfo: goalInfo
      };
    }
  }
  
  /**
   * Handle post-goal-creation feedback
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @param {Object} goalInfo - Goal information (optional)
   * @param {Object} savedGoal - Saved goal from database (optional)
   * @returns {Promise<Object>} - AI response
   */
  async handleGoalFeedback(messages, userId, goalInfo = null, savedGoal = null) {
    this.debug('Handling goal feedback');
    
    // If goalInfo not provided, extract it
    if (!goalInfo) {
      goalInfo = await this.extractGoalInformation(messages);
    }
    
    // Combine with saved goal information if available
    const goalData = savedGoal ? { ...goalInfo, ...savedGoal } : goalInfo;
    
    // Log the goal data we're using for feedback
    this.debug('Providing feedback for goal:', goalData);
    
    const feedbackPrompt = `
      ${this.systemPrompt}
      
      The user's goal has been successfully saved: "${goalData.title}"
      
      In your response:
      1. Confirm the goal was added in a casual, conversational way
      2. Offer 1-2 relevant tips for achieving this specific goal
      3. Consider suggesting a simple first step they could take
      4. Be upbeat and encouraging
      
      Keep it brief and natural - they should feel like they just told a supportive friend about their goal, not like they submitted a form.
      
      Don't say things like "Your goal has been successfully saved to the database" - instead say something like "Great! I've added your goal to track."
    `;
    
    const messageSet = this.createMessageSet(messages, feedbackPrompt);
    const completion = await this.getCompletion(messageSet);
    
    // Creating the complete response - IMPORTANT: Include these properties for client-side handling
    const response = {
      message: completion.choices[0].message,
      model: completion.model,
      usage: completion.usage,
      agent: this.name,
      state: this.STATES.FEEDBACK,
      // Explicitly mark as goal created for the frontend and chat controller
      goalCreated: true,
      goalInfo: goalData
    };
    
    this.debug('Final response with goal created flag:', response.goalCreated);
    
    return response;
  }
  
  /**
   * Extract goal information from the conversation
   * @param {Array} messages - Message history
   * @returns {Promise<Object>} - Extracted goal information
   */
  async extractGoalInformation(messages) {
    try {
      const extractionPrompt = `
        Analyze this conversation and extract information about the user's goal.
        
        Return ONLY a JSON object with these fields:
        - "title": string - the specific goal with metrics when possible (e.g., "Bench press 225 lbs for 8 reps")
        - "category": string - one of: health, career, personal, financial, other (use "health" for fitness goals)
        - "deadline": string - when they want to achieve it (e.g., "end of year", "June 2025")
        - "description": string - a brief description of the goal
        - "confidence": number - confidence in extraction (0-1)
        
        For fitness goals:
        - Include specific weights, reps, or distances in the title
        - Make the title specific and measurable
        - Use "health" as the category
        
        If any field is not mentioned in the conversation, omit it from the JSON.
        
        Carefully read through all messages to find the most specific information.
        Avoid any preamble, explanation or other text besides the JSON.
      `;
      
      const extractionMessages = [
        { role: 'system', content: extractionPrompt },
        ...messages.slice(-10), // Use recent context for extraction
        { role: 'user', content: 'Extract the goal information as JSON only.' }
      ];
      
      const completion = await this.getCompletion(extractionMessages, {
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });
      
      const extractedData = JSON.parse(completion.choices[0].message.content);
      this.debug('Extracted goal data:', extractedData);
      
      // Ensure fitness goals use "health" category
      if (extractedData.category && 
          (extractedData.category.toLowerCase() === 'fitness')) {
        extractedData.category = 'health';
      }
      
      return extractedData;
    } catch (error) {
      console.error('Error extracting goal information:', error);
      
      // Return minimal info if extraction fails
      return {
        title: '',
        category: '',
        deadline: '',
        description: '',
        confidence: 0
      };
    }
  }
  
  /**
   * Identify missing goal information
   * @param {Object} goalInfo - Extracted goal information
   * @returns {Array} - List of missing fields
   */
  identifyMissingGoalInfo(goalInfo) {
    const requiredFields = ['title', 'category', 'deadline'];
    return requiredFields.filter(field => !goalInfo[field]);
  }
  
  /**
   * Check if the user is confirming goal creation
   * @param {Array} messages - Message history
   * @returns {Promise<boolean>} - Whether user confirmed
   */
  async checkForConfirmation(messages) {
    if (messages.length < 2) return false;
    
    // Get the last user message
    const lastUserMessage = [...messages]
      .reverse()
      .find(m => m.role === 'user');
    
    if (!lastUserMessage) return false;
    
    const content = lastUserMessage.content.toLowerCase();
    
    // Simple pattern matching for confirmation
    const confirmationPatterns = [
      'yes', 'yeah', 'yep', 'sure', 'ok', 'okay',
      'sounds good', 'that\'s right', 'correct',
      'add it', 'save it', 'create it', 
      'add the goal', 'save the goal', 'create the goal',
      'let\'s do it', 'go ahead'
    ];
    
    const isSimpleConfirmation = confirmationPatterns.some(pattern => 
      content.includes(pattern) || content === pattern);
    
    if (isSimpleConfirmation) return true;
    
    // If not a simple pattern, use AI to analyze
    try {
      const analysisPrompt = `
        Analyze the user's last message to determine if they are confirming they want to save/create their goal.
        
        Return ONLY a JSON object with:
        - "isConfirming": boolean - true if they are confirming
        - "confidence": number - confidence score (0-1)
        
        Confirming messages might be like:
        - "Yes, add that goal"
        - "Sounds good"
        - "Create it"
        - "Let's go with that"
        
        But could be more complex or indirect.
      `;
      
      const analysisMessages = [
        { role: 'system', content: analysisPrompt },
        { role: 'user', content: lastUserMessage.content },
        { role: 'user', content: 'Is the user confirming they want to save their goal? Return only JSON.' }
      ];
      
      const completion = await this.getCompletion(analysisMessages, {
        temperature: 0.3,
        max_tokens: 100,
        response_format: { type: 'json_object' }
      });
      
      const result = JSON.parse(completion.choices[0].message.content);
      
      return result.isConfirming && result.confidence > 0.6;
    } catch (error) {
      console.error('Error checking for confirmation:', error);
      return false;
    }
  }
  
  /**
   * Prepare goal for saving to database
   * @param {Object} goalInfo - Extracted goal information
   * @returns {Object} - Formatted goal for database
   */
  prepareGoalForSaving(goalInfo) {
    // Map deadline string to Date if possible
    let deadline;
    if (goalInfo.deadline) {
      if (goalInfo.deadline.toLowerCase() === 'end of year') {
        deadline = new Date(new Date().getFullYear(), 11, 31); // Dec 31 current year
      } else {
        try {
          deadline = new Date(goalInfo.deadline);
        } catch (e) {
          deadline = new Date(); // Default to current date
          deadline.setMonth(deadline.getMonth() + 3); // Add 3 months
        }
      }
    } else {
      deadline = new Date();
      deadline.setMonth(deadline.getMonth() + 3); // Default 3 months
    }
    
    // Ensure valid category
    let category = 'other';
    if (goalInfo.category) {
      if (['career', 'health', 'personal', 'financial', 'other'].includes(
        goalInfo.category.toLowerCase())) {
        category = goalInfo.category.toLowerCase();
      } else if (goalInfo.category.toLowerCase() === 'fitness') {
        category = 'health';
      }
    }
    
    return {
      title: goalInfo.title || 'Untitled Goal',
      description: goalInfo.description || '',
      category: category,
      priority: goalInfo.priority || 'medium',
      status: 'in progress',
      deadline: deadline
    };
  }
}

module.exports = GoalAgent;