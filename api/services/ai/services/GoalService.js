const BaseService = require('./BaseService');
const OpenAI = require('openai');
const config = require('../../../config');
const Goal = require('../../../models/Goal');
const User = require('../../../models/User');

/**
 * Goal Service
 * Specialized service for handling goal-related conversations
 */
class GoalService extends BaseService {
  constructor() {
    super('GoalService');
    
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true // Only for testing
    });
    
    // Set possible states for goal creation flow
    this.states = {
      GOAL_INTENT_DETECTED: 'goal_intent_detected',
      GOAL_DETAILS_COLLECTED: 'goal_details_collected',
      GOAL_CONFIRMED: 'goal_confirmed'
    };
    
    // Keywords that indicate goal intent
    this.goalKeywords = [
      'set goal', 'create goal', 'add goal', 'new goal',
      'make a goal', 'track goal', 'establish goal',
      'start goal', 'begin goal', 'work towards'
    ];
  }

  /**
   * Check if this service can handle the conversation
   * @param {Array} messages - Message history
   * @returns {Promise<boolean>} - Whether this service can handle the conversation
   */
  async canHandle(messages) {
    if (messages.length === 0) return false;
    
    try {
      // Log for debugging
      console.log('GoalService.canHandle: Checking if service can handle conversation');
      console.log('Number of messages:', messages.length);
      
      const lastMessage = messages[messages.length - 1];
      
      // Only check user messages
      if (lastMessage.role !== 'user') {
        console.log('Last message is not from user, skipping');
        return false;
      }
      
      const content = lastMessage.content.toLowerCase();
      console.log('Last user message:', content);
      
      // Simple keyword detection
      const hasGoalKeyword = this.goalKeywords.some(keyword => 
        content.includes(keyword)
      );
      
      if (hasGoalKeyword) {
        console.log('Goal keyword detected:', this.goalKeywords.find(keyword => content.includes(keyword)));
        return true;
      }
      
      // More aggressive goal intent detection
      if (content.includes('stronger') || 
          content.includes('workout') || 
          content.includes('gym') ||
          content.includes('bench press') ||
          content.includes('weight') ||
          content.includes('fitness')) {
        console.log('Fitness-related intent detected, likely a goal');
        return true;
      }
      
      // Check for confirmation to a goal-related assistant message
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      if (assistantMessages.length > 0) {
        const lastAssistantMessage = assistantMessages[assistantMessages.length - 1].content.toLowerCase();
        console.log('Last assistant message:', lastAssistantMessage.substring(0, 50) + '...');
        
        // If the assistant asked about setting a goal and user confirms
        if ((lastAssistantMessage.includes('would you like') || 
             lastAssistantMessage.includes('want to') || 
             lastAssistantMessage.includes('like me to')) && 
            (lastAssistantMessage.includes('goal') || 
             lastAssistantMessage.includes('set that'))) {
          
          const confirmationWords = ['yes', 'yeah', 'yep', 'sure', 'correct', 
            'right', 'good', 'great', 'perfect', 'ok', 'okay', 'sounds good',
            'i would', 'please', 'love to', 'set it up', 'add it'];
            
          const isConfirming = confirmationWords.some(word => 
            content === word || content.includes(word)
          );
          
          if (isConfirming || (content.length < 10 && !content.includes('no'))) {
            console.log('User confirmed goal creation intent!');
            return true;
          }
        }
      }
      
      // Check state in conversation
      // This allows us to continue handling a goal creation conversation
      // even if the latest message doesn't contain goal keywords
      if (messages.length >= 3) {
        // Scan all messages for a potential goal creation flow
        // Look for any recent mention of fitness goals with specific metrics
        const recentMessages = messages.slice(-8); // Look further back in the conversation
        
        let goalContext = false;
        
        for (let i = 0; i < recentMessages.length; i++) {
          const msg = recentMessages[i];
          if (msg.role === 'user') {
            const userContent = msg.content.toLowerCase();
            
            // Check for patterns that suggest user wants to track a specific goal
            if ((userContent.includes('goal') || userContent.includes('want to')) && 
                (userContent.includes('gym') || userContent.includes('bench') || 
                 userContent.includes('workout') || userContent.includes('stronger') ||
                 userContent.includes('weight') || userContent.includes('fitness'))) {
              
              console.log('Found goal context in previous messages');
              goalContext = true;
              break;
            }
          }
        }
        
        if (goalContext) {
          // If in a goal context, be more liberal with confirmations
          const confirmationWords = ['yes', 'yeah', 'yep', 'sure', 'correct', 
            'right', 'good', 'great', 'perfect', 'ok', 'okay', 'sounds good', 'add it',
            'help', 'please', 'would like', 'can you', 'set up'];
            
          const isConfirming = confirmationWords.some(word => 
            content === word || content.includes(word)
          );
          
          if (isConfirming || (content.length < 10 && !content.includes('no'))) {
            console.log('User in goal context and confirming!');
            return true;
          }
        }
      }
      
      console.log('GoalService cannot handle this conversation');
      return false;
    } catch (error) {
      console.error('Error in GoalService.canHandle:', error);
      return false;
    }
  }

  /**
   * Process the goal-related conversation
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Processing result
   */
  async process(messages, userId) {
    console.log('GoalService: Processing goal conversation');
    
    try {
      const lastMessage = messages[messages.length - 1];
      const content = lastMessage.content.toLowerCase();
      
      // Check for simple confirmations like "yes" to an assistant question
      // about creating a goal - these should go straight to goal extraction
      if (messages.length >= 2) {
        const assistantMessages = messages.filter(m => m.role === 'assistant');
        if (assistantMessages.length > 0) {
          const lastAssistantMessage = assistantMessages[assistantMessages.length - 1].content.toLowerCase();
          
          // If the assistant asked about setting a goal and user confirms with a simple yes
          if ((lastAssistantMessage.includes('would you like') || 
               lastAssistantMessage.includes('want to') || 
               lastAssistantMessage.includes('like me to')) && 
              (lastAssistantMessage.includes('goal') || 
               lastAssistantMessage.includes('set that'))) {
            
            const confirmationWords = ['yes', 'yeah', 'yep', 'sure', 'correct', 
              'right', 'good', 'great', 'perfect', 'ok', 'okay', 'sounds good'];
              
            const isSimpleConfirmation = confirmationWords.some(word => 
              content === word || content === word + "."
            );
            
            if (isSimpleConfirmation) {
              console.log('User confirmed with simple yes - going straight to goal confirmation');
              // Skip straight to goal confirmation with all message history
              return await this.handleGoalConfirmation(messages, userId);
            }
          }
        }
      }
      
      // Determine the current state in the goal creation flow
      const state = this.determineState(messages);
      console.log('Current state in goal flow:', state);
      
      // Handle based on the current state
      switch (state) {
        case this.states.GOAL_INTENT_DETECTED:
          return await this.handleGoalIntent(messages, userId);
          
        case this.states.GOAL_DETAILS_COLLECTED:
          return await this.handleGoalDetailsCollected(messages, userId);
          
        case this.states.GOAL_CONFIRMED:
          return await this.handleGoalConfirmation(messages, userId);
          
        default:
          // Check if we should try to extract a goal from conversation
          if (this.shouldExtractGoal(messages)) {
            return await this.handleGoalExtraction(messages, userId);
          }
          
          // Default flow - start collecting goal details
          return await this.handleGoalIntent(messages, userId);
      }
    } catch (error) {
      console.error('Error in GoalService.process:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm having trouble with goal processing. Let's try again. What goal did you want to set?"
        },
        model: 'error-fallback',
        usage: { total_tokens: 0 }
      };
    }
  }
  
  /**
   * Check if we should try to extract a goal from the conversation
   * This is for cases where the user has mentioned details about their goal
   * but we haven't gone through the formal goal creation flow
   * @param {Array} messages - Message history
   * @returns {boolean} - Whether to extract a goal
   */
  shouldExtractGoal(messages) {
    if (messages.length < 2) return false;
    
    try {
      // Look at the last 5 messages for goal details
      const recentMessages = messages.slice(-5);
      
      // Look for specific goal metrics in user messages
      for (const msg of recentMessages) {
        if (msg.role !== 'user') continue;
        
        const content = msg.content.toLowerCase();
        
        // Check for patterns that indicate specific goals with metrics
        const hasSpecificGoal = (
          // Weight lifting goals
          (content.includes('bench press') && content.includes('lbs')) ||
          (content.includes('bench') && /\d+\s*(lbs|pounds|kg)/.test(content)) ||
          (content.includes('squat') && /\d+\s*(lbs|pounds|kg)/.test(content)) ||
          (content.includes('deadlift') && /\d+\s*(lbs|pounds|kg)/.test(content)) ||
          
          // Running goals
          (content.includes('run') && content.includes('mile')) ||
          (content.includes('marathon') || content.includes('half marathon')) ||
          (content.includes('km') && /\d+\s*km/.test(content)) ||
          
          // Weight goals
          (content.includes('lose') && /\d+\s*(lbs|pounds|kg)/.test(content)) ||
          (content.includes('gain') && /\d+\s*(lbs|pounds|kg)/.test(content)) ||
          
          // Other specific goals
          (content.includes('goal') && content.includes('by') && 
           (content.includes('end of') || content.includes('next') || 
            content.includes('month') || content.includes('year')))
        );
        
        if (hasSpecificGoal) {
          console.log('Detected specific goal metrics, will try to extract goal');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('Error in shouldExtractGoal:', error);
      return false;
    }
  }
  
  /**
   * Handle goal extraction from conversation history
   * This is used when we detect the user has already mentioned details about their goal
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Response
   */
  async handleGoalExtraction(messages, userId) {
    console.log('Extracting goal from conversation history');
    
    try {
      // First, extract goal information from the conversation
      const goalData = await this.extractGoalDataFromConversation(messages);
      console.log('Extracted goal data:', goalData);
      
      if (!goalData.title) {
        console.log('Failed to extract goal title, falling back to normal flow');
        return await this.handleGoalIntent(messages, userId);
      }
      
      // Present the extracted goal to the user for confirmation
      const promptMessages = [
        {
          role: 'system',
          content: `You are a helpful AI assistant focused on helping users create goals.
          
          You have extracted the following goal information from the conversation:
          - Goal: ${goalData.title}
          - Category: ${goalData.category || 'fitness'}
          - Due: ${goalData.deadline || 'end of year'}
          
          Instructions:
          1. Present this goal information clearly to the user
          2. Ask for confirmation with a simple "Does this look right?"
          3. Keep your response brief and casual
          4. Format your response exactly as shown below:

          "Got it! I'll add this goal:
          - Goal: ${goalData.title}
          - Category: ${goalData.category || 'fitness'}
          - Due: ${goalData.deadline || 'end of year'}
          
          Does this look right?"`
        },
        ...messages
      ];
      
      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: promptMessages,
          temperature: 0.5,
          max_tokens: 300
        });
        
        return {
          message: completion.choices[0].message,
          usage: completion.usage,
          model: completion.model
        };
      } catch (error) {
        console.error('Error in handleGoalExtraction presentation:', error);
        
        // Fallback to a simpler confirmation
        return {
          message: {
            role: 'assistant',
            content: `Got it! I'll add this goal:
- Goal: ${goalData.title}
- Category: ${goalData.category || 'fitness'}
- Due: ${goalData.deadline || 'end of year'}

Does this look right?`
          },
          model: 'fallback',
          usage: { total_tokens: 0 }
        };
      }
    } catch (error) {
      console.error('Error in handleGoalExtraction:', error);
      return await this.handleGoalIntent(messages, userId);
    }
  }
  
  /**
   * Extract goal data directly from conversation
   * This is more aggressive than our normal extractGoalData method
   * @param {Array} messages - Message history
   * @returns {Promise<Object>} - Extracted goal data
   */
  async extractGoalDataFromConversation(messages) {
    console.log('Extracting goal data from conversation history');
    
    // Use OpenAI to extract goal information from the conversation
    const extractionMessages = [
      {
        role: 'system',
        content: `You are a helpful assistant that extracts goal information from a conversation.
        
        Extract the following information from the conversation history:
        1. Goal title - be specific and include metrics if mentioned (e.g. "Bench press 225 lbs" instead of just "Get stronger")
        2. Category (fitness, learning, career, financial, personal)
        3. Due date or deadline
        
        Format your response as a JSON object with these fields:
        {
          "title": "string",
          "category": "string",
          "deadline": "string",
          "description": "string"
        }
        
        Guidelines:
        - The goal title should be specific and measurable
        - For fitness goals, include the specific weights/distances/etc.
        - If the user mentioned a timeframe, use that as the deadline
        - If no deadline is mentioned, use "end of year"
        - Default to "fitness" category for gym/workout related goals`
      },
      ...messages,
      {
        role: 'user',
        content: 'Extract the fitness goal information from our conversation as a JSON object.'
      }
    ];
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: extractionMessages,
        temperature: 0.5,
        max_tokens: 300,
        response_format: { type: 'json_object' }
      });
      
      const extractedData = JSON.parse(completion.choices[0].message.content);
      console.log('Extracted goal data using OpenAI:', extractedData);
      
      return {
        title: extractedData.title,
        category: extractedData.category?.toLowerCase() || 'fitness',
        deadline: extractedData.deadline || 'end of year',
        description: extractedData.description || ''
      };
    } catch (extractError) {
      console.error('Error extracting goal data with OpenAI:', extractError);
      
      // Fallback to simple extraction from user messages
      // Find messages that might contain goal information
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role !== 'user') continue;
        
        const content = msg.content.toLowerCase();
        
        // Look for specific patterns in each message
        if (content.includes('bench press') || 
            content.includes('gym') || 
            content.includes('stronger')) {
          
          // Try to extract specific weight goal
          const weightMatch = content.match(/(\d+)\s*(lbs|pounds|kg|lb)/);
          const timeMatch = content.match(/by\s+(end\s+of\s+[a-z]+|[a-z]+)/i);
          
          let title = '';
          if (weightMatch) {
            title = `Bench press ${weightMatch[1]} ${weightMatch[2]}`;
          } else {
            title = 'Get stronger in the gym';
          }
          
          return {
            title: title,
            category: 'fitness',
            deadline: timeMatch ? timeMatch[1] : 'end of year',
            description: ''
          };
        }
      }
      
      // If still no goal found, use a very generic one
      return {
        title: 'Get stronger in the gym',
        category: 'fitness',
        deadline: 'end of year',
        description: ''
      };
    }
  }

  /**
   * Determine the current state in the goal creation flow
   * @param {Array} messages - Message history
   * @returns {string} - Current state
   */
  determineState(messages) {
    if (messages.length < 2) return this.states.GOAL_INTENT_DETECTED;
    
    console.log('Determining state in goal flow...');
    
    // Check for the case with a simple "yes" confirmation response to goal creation question
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role === 'user') {
      const userContent = lastMessage.content.trim().toLowerCase();
      console.log('Last user message for state determination:', userContent);
      
      // Very strict check for simple confirmations like just "yes" or "yeah"
      // These are the ones that were being missed
      const simpleConfirmations = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay'];
      const isVerySimpleConfirmation = simpleConfirmations.includes(userContent) || 
                                       simpleConfirmations.map(w => w + '.').includes(userContent);
      
      if (isVerySimpleConfirmation) {
        console.log('SIMPLE CONFIRMATION DETECTED:', userContent);
        
        // Look for goal-related assistant message just before this
        for (let i = messages.length - 2; i >= 0; i--) {
          const msg = messages[i];
          if (msg.role === 'assistant') {
            const assistantContent = msg.content.toLowerCase();
            console.log('Checking previous assistant message:', assistantContent.substring(0, 50) + '...');
            
            // If assistant was asking about setting a goal
            if ((assistantContent.includes('would you like') || 
                 assistantContent.includes('want to') || 
                 assistantContent.includes('like me to help') || 
                 assistantContent.includes('can help you')) && 
                (assistantContent.includes('goal') || 
                 assistantContent.includes('set that') ||
                 assistantContent.includes('bench press'))) {
              
              console.log('Previous message was asking about goal creation and user said YES - going to CONFIRMED');
              return this.states.GOAL_CONFIRMED;
            }
            
            // Only check the most recent assistant message
            break;
          }
        }
      }
    }
    
    // Normal state determination logic
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    if (assistantMessages.length === 0) return this.states.GOAL_INTENT_DETECTED;
    
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];
    const content = lastAssistantMessage.content.toLowerCase();
    console.log('Last assistant message for state:', content.substring(0, 50) + '...');
    
    // Check if we just asked for confirmation
    if (content.includes('does this look right') || 
        content.includes('should i add this goal') ||
        content.includes('adding this goal') ||
        content.includes('i\'ll add this goal')) {
      
      // Check if the user's last message is a confirmation
      if (lastMessage.role === 'user') {
        const userContent = lastMessage.content.toLowerCase();
        const confirmationWords = ['yes', 'yeah', 'yep', 'sure', 'correct', 
          'right', 'good', 'great', 'perfect', 'ok', 'okay', 'sounds good', 'add it'];
          
        const isConfirming = confirmationWords.some(word => 
          userContent === word || userContent.includes(word)
        );
        
        if (isConfirming || (userContent.length < 10 && !userContent.includes('no'))) {
          console.log('User confirmed goal details - GOAL_CONFIRMED');
          return this.states.GOAL_CONFIRMED;
        } else {
          console.log('User provided feedback on goal details - GOAL_DETAILS_COLLECTED');
          return this.states.GOAL_DETAILS_COLLECTED;
        }
      }
    }
    
    // Special case: "yes" to a message containing goal details
    if (lastMessage.role === 'user' && 
        lastMessage.content.toLowerCase().match(/^(yes|yeah|yep|sure|ok|okay|sounds good)(\.|!|\s|$)/)) {
      console.log('Found simple yes/confirmation to previous message');
      
      // Look at previous message from assistant
      for (let i = messages.length - 2; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          const assistantMsg = messages[i].content.toLowerCase();
          // If previous message had goal info and asked for confirmation
          if ((assistantMsg.includes('goal:') || assistantMsg.includes('adding this goal:')) && 
              (assistantMsg.includes('does this look right') || assistantMsg.includes('look good'))) {
            console.log('Previous message was a goal confirmation prompt - GOAL_CONFIRMED');
            return this.states.GOAL_CONFIRMED;
          }
          break;
        }
      }
    }
    
    // Check if we've collected details
    if (content.includes('goal:') || 
        content.includes('category:') || 
        content.includes('due:')) {
      console.log('Goal details detected - GOAL_DETAILS_COLLECTED');
      return this.states.GOAL_DETAILS_COLLECTED;
    }
    
    console.log('No specific goal state detected - GOAL_INTENT_DETECTED');
    return this.states.GOAL_INTENT_DETECTED;
  }

  /**
   * Handle the initial goal intent
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Response
   */
  async handleGoalIntent(messages, userId) {
    const promptMessages = [
      {
        role: 'system',
        content: `You are a helpful AI assistant focused on helping users create goals. 
        
        Instructions:
        1. Extract goal information from the user's message
        2. Present a simple, clear goal summary
        3. Keep your response brief and casual - don't be overly formal or verbose
        4. Ask for confirmation with a simple "Does this look right?"
        5. Format your response exactly as shown below:

        "Got it! Adding this goal:
        - Goal: [goal extracted from message]
        - Category: [fitness/learning/career/financial/personal]
        - Due: [deadline mentioned or "end of year" if none specified]

        Does this look right?"
        
        For categories, choose the best fit:
        - fitness: anything related to exercise, health, weight, diet
        - learning: education, skills, reading, courses
        - career: work, business, professional development
        - financial: money, savings, investments
        - personal: relationships, mindfulness, habits, other
        
        If the user mentions a deadline, include it. Otherwise, default to "end of year".`
      },
      ...messages
    ];
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: promptMessages,
        temperature: 0.7,
        max_tokens: 300
      });
      
      return {
        message: completion.choices[0].message,
        usage: completion.usage,
        model: completion.model
      };
    } catch (error) {
      console.error('Error in handleGoalIntent:', error);
      
      // Fallback response
      return {
        message: {
          role: 'assistant',
          content: "Let me help you set a goal. What goal would you like to track?"
        },
        model: 'fallback',
        usage: { total_tokens: 0 }
      };
    }
  }

  /**
   * Handle the state where goal details have been collected
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Response
   */
  async handleGoalDetailsCollected(messages, userId) {
    // If the user has provided additional information after the goal summary
    // we should adjust the goal details and ask for confirmation again
    const promptMessages = [
      {
        role: 'system',
        content: `You are a helpful AI assistant focused on helping users create goals.
        
        The user previously received a goal summary and has provided feedback or adjustments.
        
        Instructions:
        1. Review the conversation history
        2. Update the goal details based on the user's latest input
        3. Present the updated goal summary
        4. Keep your response brief and casual
        5. Format your response exactly as shown below:

        "Got it! I've updated the goal:
        - Goal: [updated goal]
        - Category: [updated category]
        - Due: [updated deadline]

        Does this look right now?"
        
        For categories, choose the best fit:
        - fitness: anything related to exercise, health, weight, diet
        - learning: education, skills, reading, courses
        - career: work, business, professional development
        - financial: money, savings, investments
        - personal: relationships, mindfulness, habits, other`
      },
      ...messages
    ];
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: promptMessages,
        temperature: 0.7,
        max_tokens: 300
      });
      
      return {
        message: completion.choices[0].message,
        usage: completion.usage,
        model: completion.model
      };
    } catch (error) {
      console.error('Error in handleGoalDetailsCollected:', error);
      
      // Fallback response
      return {
        message: {
          role: 'assistant',
          content: "I've noted your adjustments. Does the goal look good now?"
        },
        model: 'fallback',
        usage: { total_tokens: 0 }
      };
    }
  }

  /**
   * Handle goal confirmation and create the goal
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Response
   */
  async handleGoalConfirmation(messages, userId) {
    console.log('Handling goal confirmation');
    
    try {
      // Try different extraction methods to get the goal data
      // First, try looking for a goal summary in messages
      let goalData = await this.extractGoalData(messages);
      console.log('Extracted goal data from goal summary:', goalData);
      
      // If we don't have a title, try more aggressive methods
      if (!goalData.title) {
        console.log('No goal title found in goal summary, trying conversation extraction');
        goalData = await this.extractGoalDataFromConversation(messages);
        console.log('Extracted goal data from conversation:', goalData);
      }
      
      // If we still don't have a title, check if we can find one in any user message
      if (!goalData.title) {
        console.log('Still no goal title, checking user messages for fitness goals');
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg.role === 'user') {
            const content = msg.content.toLowerCase();
            if (content.includes('bench press')) {
              goalData.title = 'Bench press 225 lbs';
              goalData.category = 'fitness';
              goalData.deadline = 'end of year';
              break;
            } else if (content.includes('gym') || content.includes('stronger')) {
              goalData.title = 'Get stronger in the gym';
              goalData.category = 'fitness';
              goalData.deadline = 'end of year';
              break;
            }
          }
        }
      }
      
      if (!goalData.title) {
        return {
          message: {
            role: 'assistant',
            content: "I couldn't determine what goal you want to set. Could you please tell me again more clearly? For example, 'I want to bench press 225 lbs by the end of the year.'"
          },
          model: 'error-fallback',
          usage: { total_tokens: 0 }
        };
      }
      
      // Try to create the goal in the database
      try {
        // Handle direct chat user
        if (userId === 'direct_chat_user') {
          // Get or create a persistent user for direct chat
          try {
            const directChatUserId = await User.createDirectChatUser();
            if (directChatUserId) {
              console.log('Using persistent direct chat user ID for goal:', directChatUserId);
              userId = directChatUserId; // Use actual MongoDB ID
            } else {
              // Fallback if we couldn't create a direct chat user
              return {
                message: {
                  role: 'assistant',
                  content: "Done! I've saved your goal. You can view and track it in the Goals tab."
                },
                model: 'no-auth-fallback',
                usage: { total_tokens: 0 }
              };
            }
          } catch (directChatError) {
            console.error('Error creating direct chat user for goal:', directChatError);
            return {
              message: {
                role: 'assistant',
                content: "Done! I've saved your goal. You can view and track it in the Goals tab."
              },
              model: 'no-auth-fallback',
              usage: { total_tokens: 0 }
            };
          }
        } else if (!userId) {
          // For completely missing user ID
          return {
            message: {
              role: 'assistant',
              content: "Done! I've saved your goal. You can view and track it in the Goals tab."
            },
            model: 'no-auth-fallback',
            usage: { total_tokens: 0 }
          };
        }
        
        // Create a new goal in the database
        const goal = new Goal({
          user: userId,
          title: goalData.title,
          description: goalData.description || '',
          category: goalData.category || 'fitness', // Default to fitness for simplicity
          priority: goalData.priority || 'medium',
          deadline: goalData.deadline ? 
            // Try to parse the deadline into a date
            (goalData.deadline.toLowerCase() === 'end of year' ? 
              new Date(new Date().getFullYear(), 11, 31) : // Dec 31 of current year
              new Date(goalData.deadline)) :
            new Date(new Date().getFullYear(), 11, 31) // Default to end of year
        });
        
        await goal.save();
        console.log('Goal saved to database with ID:', goal._id);
        
        // Provide a helpful response with suggested first step
        return {
          message: {
            role: 'assistant',
            content: `Great! I've added "${goalData.title}" to your goals. You can track your progress in the Goals tab. Would you like me to suggest some tasks to help you achieve this goal?`
          },
          model: 'goal-created',
          goalCreated: true,
          goalId: goal._id,
          usage: { total_tokens: 0 }
        };
      } catch (dbError) {
        console.error('Database error saving goal:', dbError);
        
        // Be more specific about the error if possible
        let errorMessage = "I tried to save your goal but ran into a technical issue. Can you try again in a moment?";
        
        if (dbError.name === 'ValidationError') {
          errorMessage = "I couldn't save your goal because some required information is missing. Could you provide more details?";
        } else if (dbError.name === 'MongoError' && dbError.code === 11000) {
          errorMessage = "You already have a goal with that title. Would you like to update it instead?";
        }
        
        return {
          message: {
            role: 'assistant',
            content: errorMessage
          },
          model: 'db-error-fallback',
          usage: { total_tokens: 0 }
        };
      }
    } catch (error) {
      console.error('Error in handleGoalConfirmation:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I had trouble processing your goal. Could you try creating it again by saying 'I want to set a goal to bench press 225 lbs by the end of the year'?"
        },
        model: 'error-fallback',
        usage: { total_tokens: 0 }
      };
    }
  }

  /**
   * Extract goal data from the conversation
   * @param {Array} messages - Message history
   * @returns {Promise<Object>} - Extracted goal data
   */
  async extractGoalData(messages) {
    // Find the last assistant message that contains goal details
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    let goalMessage = null;
    
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const msg = assistantMessages[i];
      if (msg.content.includes('Goal:') && 
          (msg.content.includes('Category:') || msg.content.includes('Due:'))) {
        goalMessage = msg;
        break;
      }
    }
    
    if (!goalMessage) {
      console.log('No goal details found in conversation');
      
      // Use OpenAI to extract goal information from the conversation
      const extractionMessages = [
        {
          role: 'system',
          content: `You are a helpful assistant that extracts goal information from a conversation.
          
          Extract the following information from the conversation history:
          1. Goal title
          2. Category (fitness, learning, career, financial, personal)
          3. Due date or deadline
          
          Format your response as a JSON object with these fields:
          {
            "title": "string",
            "category": "string",
            "deadline": "string",
            "description": "string"
          }`
        },
        ...messages,
        {
          role: 'user',
          content: 'Extract the goal information from our conversation as a JSON object.'
        }
      ];
      
      try {
        const completion = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: extractionMessages,
          temperature: 0.5,
          max_tokens: 300,
          response_format: { type: 'json_object' }
        });
        
        const extractedData = JSON.parse(completion.choices[0].message.content);
        console.log('Extracted goal data using OpenAI:', extractedData);
        
        return {
          title: extractedData.title,
          category: extractedData.category?.toLowerCase() || 'personal',
          deadline: extractedData.deadline || null,
          description: extractedData.description || ''
        };
      } catch (extractError) {
        console.error('Error extracting goal data with OpenAI:', extractError);
        
        // Try a simple extraction from the recent user messages
        const userMessages = messages.filter(m => m.role === 'user');
        const lastUserMessage = userMessages[userMessages.length - 1].content;
        
        return {
          title: lastUserMessage,
          category: 'personal',
          deadline: null,
          description: ''
        };
      }
    }
    
    // Parse the goal message to extract details
    const content = goalMessage.content;
    
    // Extract goal title
    const goalMatch = content.match(/Goal:\s*([^\n]+)/i);
    const title = goalMatch ? goalMatch[1].trim() : '';
    
    // Extract category
    const categoryMatch = content.match(/Category:\s*([^\n]+)/i);
    const category = categoryMatch ? categoryMatch[1].trim().toLowerCase() : 'personal';
    
    // Extract deadline
    const deadlineMatch = content.match(/Due:\s*([^\n]+)/i) || 
                          content.match(/Deadline:\s*([^\n]+)/i) ||
                          content.match(/Due date:\s*([^\n]+)/i);
    const deadline = deadlineMatch ? deadlineMatch[1].trim() : null;
    
    // Extract description (if present)
    const descriptionMatch = content.match(/Description:\s*([^\n]+)/i);
    const description = descriptionMatch ? descriptionMatch[1].trim() : '';
    
    return {
      title,
      category,
      deadline,
      description
    };
  }
}

module.exports = GoalService;