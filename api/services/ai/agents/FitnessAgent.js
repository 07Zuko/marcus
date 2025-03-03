/**
 * Fitness Agent
 * 
 * Specialized AI agent for handling fitness, health, and wellness
 * conversations with a focus on coaching and expertise.
 */

const BaseAgent = require('./BaseAgent');

class FitnessAgent extends BaseAgent {
  /**
   * Create a new Fitness Agent
   * @param {OpenAI} openai - OpenAI instance
   * @param {Object} claudeCodeImplementer - Claude Code implementation tool
   * @param {Object} databaseOps - Database operations tool
   */
  constructor(openai, claudeCodeImplementer, databaseOps) {
    super('FitnessAgent', openai, claudeCodeImplementer);
    
    // Store database operations
    this.databaseOps = databaseOps;
    
    // System prompt for fitness coaching
    this.systemPrompt = `
      You are Marcus's Fitness Coach, a specialized AI focused on fitness and health expertise.
      
      Your primary responsibilities:
      1. Provide expert fitness and workout advice
      2. Help users understand exercise techniques
      3. Create workout plans and routines
      4. Offer nutrition and recovery guidance
      5. Track fitness progress toward goals
      
      Key principles:
      - Keep advice evidence-based and scientifically sound
      - Focus on safety first, especially for beginners
      - Be encouraging and motivational
      - Personalize advice based on the user's experience level
      - Recognize when a user might need a health professional
      
      Your tone should be:
      - Knowledgeable but conversational
      - Enthusiastic without being pushy
      - Supportive and understanding
      - Friendly, like a real fitness coach
      
      When discussing specific exercises:
      - Explain proper form in clear, simple terms
      - Suggest appropriate progression paths
      - Provide realistic expectations for results
      - Offer modifications for different ability levels
      
      Always maintain a natural, conversational flow rather than sounding like a technical manual.
    `;
  }
  
  /**
   * Process a fitness-related conversation
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @param {Object} analysis - Conversation analysis
   * @returns {Promise<Object>} - AI response
   */
  async processConversation(messages, userId, analysis) {
    this.debug('Processing fitness conversation');
    
    try {
      // Get user's fitness goals for context
      const fitnessGoals = await this.getFitnessGoals(userId);
      this.debug('Fitness goals retrieved:', fitnessGoals.length);
      
      // Determine if this is about an existing goal
      const goalContext = await this.determineGoalContext(messages, fitnessGoals);
      this.debug('Goal context:', goalContext);
      
      // Create custom prompt based on context
      const customPrompt = this.createContextualPrompt(messages, fitnessGoals, goalContext);
      
      // Get completion from AI
      const messageSet = this.createMessageSet(messages, customPrompt);
      const completion = await this.getCompletion(messageSet);
      
      // Determine if we should suggest creating a goal
      const shouldSuggestGoal = await this.shouldSuggestGoalCreation(messages, completion.choices[0].message);
      
      // Wrap with goal creation suggestion if appropriate
      let finalResponse = completion.choices[0].message;
      
      if (shouldSuggestGoal.suggest && !goalContext.isExistingGoal) {
        this.debug('Adding goal creation suggestion');
        
        // Enhance the response with a goal suggestion
        const enhancedContent = `${finalResponse.content}

Would you like me to add this as a fitness goal to track your progress? I can help you define specific targets and track your improvements over time.`;
        
        finalResponse = {
          ...finalResponse,
          content: enhancedContent
        };
      }
      
      return {
        message: finalResponse,
        model: completion.model,
        usage: completion.usage,
        agent: this.name,
        goalInfo: shouldSuggestGoal.goalInfo
      };
    } catch (error) {
      console.error('Error in FitnessAgent:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm having some trouble processing your fitness question. Could we try again? I'm here to help with workout advice, exercise techniques, and fitness goals."
        },
        model: 'error-fallback',
        agent: this.name
      };
    }
  }
  
  /**
   * Get user's fitness goals
   * @param {string} userId - User ID
   * @returns {Promise<Array>} - Fitness goals
   */
  async getFitnessGoals(userId) {
    try {
      // Get all user goals
      const goals = await this.databaseOps.getUserGoals(userId);
      
      // Filter for fitness/health goals
      return goals.filter(goal => 
        goal.category === 'health' || goal.category === 'fitness'
      );
    } catch (error) {
      console.error('Error fetching fitness goals:', error);
      return [];
    }
  }
  
  /**
   * Determine if conversation is about an existing goal
   * @param {Array} messages - Message history
   * @param {Array} fitnessGoals - User's fitness goals
   * @returns {Promise<Object>} - Goal context
   */
  async determineGoalContext(messages, fitnessGoals) {
    // If no fitness goals, it can't be about an existing goal
    if (!fitnessGoals.length) {
      return { 
        isExistingGoal: false,
        relevantGoal: null
      };
    }
    
    try {
      // Extract the last user message
      const lastMessage = [...messages]
        .reverse()
        .find(m => m.role === 'user');
      
      if (!lastMessage) {
        return { isExistingGoal: false, relevantGoal: null };
      }
      
      // Check for direct mentions of goals by title
      for (const goal of fitnessGoals) {
        if (lastMessage.content.toLowerCase().includes(goal.title.toLowerCase())) {
          return { 
            isExistingGoal: true,
            relevantGoal: goal
          };
        }
      }
      
      // More sophisticated analysis using AI
      const analysisPrompt = `
        The user has the following fitness goals:
        ${fitnessGoals.map(g => `- ${g.title}`).join('\n')}
        
        Based on the conversation, is the user talking about one of these specific goals?
        Return a JSON object with:
        - "isAboutExistingGoal": boolean
        - "relevantGoalTitle": string or null
        - "confidence": number between 0-1
      `;
      
      const analysisMessages = [
        { role: 'system', content: analysisPrompt },
        ...messages.slice(-5),
        { role: 'user', content: 'Is this conversation about one of their existing goals? Return only JSON.' }
      ];
      
      const completion = await this.getCompletion(analysisMessages, {
        temperature: 0.3,
        max_tokens: 150,
        response_format: { type: 'json_object' }
      });
      
      const result = JSON.parse(completion.choices[0].message.content);
      
      // If high confidence of match and specified a goal title
      if (result.isAboutExistingGoal && 
          result.relevantGoalTitle && 
          result.confidence > 0.7) {
        
        // Find the matching goal
        const matchingGoal = fitnessGoals.find(g => 
          g.title.toLowerCase().includes(result.relevantGoalTitle.toLowerCase()) ||
          result.relevantGoalTitle.toLowerCase().includes(g.title.toLowerCase())
        );
        
        if (matchingGoal) {
          return { 
            isExistingGoal: true,
            relevantGoal: matchingGoal
          };
        }
      }
      
      return { isExistingGoal: false, relevantGoal: null };
    } catch (error) {
      this.debug('Error determining goal context:', error);
      return { isExistingGoal: false, relevantGoal: null };
    }
  }
  
  /**
   * Create a contextual prompt based on the user's goals and context
   * @param {Array} messages - Message history
   * @param {Array} fitnessGoals - User's fitness goals
   * @param {Object} goalContext - Goal context
   * @returns {string} - Contextual prompt
   */
  createContextualPrompt(messages, fitnessGoals, goalContext) {
    let contextualPrompt = this.systemPrompt;
    
    // Add fitness goal context
    if (fitnessGoals.length > 0) {
      contextualPrompt += `\n\nUser's current fitness goals:
${fitnessGoals.map(g => 
  `- ${g.title} (deadline: ${new Date(g.deadline).toLocaleDateString()}, status: ${g.status})`
).join('\n')}`;
    } else {
      contextualPrompt += '\n\nThe user does not have any fitness goals set yet.';
    }
    
    // If the conversation is about a specific goal
    if (goalContext.isExistingGoal && goalContext.relevantGoal) {
      const goal = goalContext.relevantGoal;
      
      contextualPrompt += `\n\nThis conversation is specifically about the user's goal:
- Title: ${goal.title}
- Deadline: ${new Date(goal.deadline).toLocaleDateString()}
- Status: ${goal.status}
- Progress: ${goal.progress || 0}%
- Description: ${goal.description || 'No description'}

Focus your response on this specific goal, tracking progress, and providing relevant advice.`;
    }
    
    return contextualPrompt;
  }
  
  /**
   * Determine if we should suggest creating a goal
   * @param {Array} messages - Message history
   * @param {Object} aiResponse - AI response message
   * @returns {Promise<Object>} - Whether to suggest goal and potential goal info
   */
  async shouldSuggestGoalCreation(messages, aiResponse) {
    try {
      // Extract the last few messages for context
      const recentMessages = [...messages.slice(-3), { 
        role: aiResponse.role, 
        content: aiResponse.content 
      }];
      
      // Create analysis prompt
      const analysisPrompt = `
        Analyze this fitness conversation and determine:
        1. Should we suggest creating a fitness goal for the user?
        2. Is the user discussing a specific, measurable fitness objective?
        3. Would tracking this as a goal be helpful to the user?
        
        Return a JSON object with:
        - "suggest": boolean - should we suggest creating a goal?
        - "confidence": number - confidence in this assessment (0-1)
        - "goalInfo": object with potential goal details if appropriate: {
           "title": string - specific goal with metrics when possible
           "deadline": string - potential timeframe
           "description": string - brief description
        }
        
        Only suggest a goal if:
        - The conversation involves a clear fitness objective
        - The user isn't already tracking this goal
        - The goal is specific and measurable
        - The goal would benefit from tracking
      `;
      
      const analysisMessages = [
        { role: 'system', content: analysisPrompt },
        ...recentMessages,
        { role: 'user', content: 'Should we suggest creating a fitness goal based on this conversation? Return only JSON.' }
      ];
      
      const completion = await this.getCompletion(analysisMessages, {
        temperature: 0.3,
        max_tokens: 250,
        response_format: { type: 'json_object' }
      });
      
      const result = JSON.parse(completion.choices[0].message.content);
      
      // Only suggest if confident
      if (!result.suggest || result.confidence < 0.7) {
        return { suggest: false };
      }
      
      return {
        suggest: true,
        goalInfo: result.goalInfo || null
      };
    } catch (error) {
      this.debug('Error in goal suggestion analysis:', error);
      return { suggest: false };
    }
  }
}

module.exports = FitnessAgent;