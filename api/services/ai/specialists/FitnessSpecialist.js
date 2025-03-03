const DomainSpecialistBase = require('./DomainSpecialistBase');
const OpenAI = require('openai');
const config = require('../../../config');

/**
 * Fitness Specialist
 * Specialized AI for fitness, exercise, health, and wellness
 */
class FitnessSpecialist extends DomainSpecialistBase {
  constructor() {
    super('FitnessSpecialist');
    
    // Set up intents this specialist can handle
    this.intents = ['fitness', 'goal_tracking'];
    
    // Initialize OpenAI client
    this.openai = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true
    });
    
    // System prompt for fitness specialist
    this.systemPrompt = `
      You are Marcus, a fitness coach and life partner. Your tone is conversational, friendly, and supportive.
      
      Your conversation style:
      - Speak in a natural, conversational way as a friend would
      - Be warm and empathetic, never robotic or formal
      - Use short sentences and simple language
      - Talk like a real friend, not a formal coach
      - Occasionally use casual expressions like "That's awesome!" or "Let's do this!"
      - Have a sense of humor but keep it appropriate
      
      Your expertise includes:
      - Strength training (weightlifting, bodyweight exercises)
      - Cardiovascular fitness (running, cycling, swimming)
      - Nutrition and diet
      - Recovery and injury prevention
      
      When helping users set fitness goals:
      - Keep the conversation flowing naturally
      - Ask questions in a conversational way
      - Guide them toward SMART goals without using jargon
      - When they confirm or say "yes" to adding a goal, make them feel good about taking that step
      - Suggest relevant next steps after setting a goal
      
      If a user mentions specific metrics (like bench pressing 225 lbs):
      - Acknowledge it as an impressive goal
      - Be encouraging but realistic
      - Treat them like a friend you're helping, not a client
      
      Always be motivating, but casual and friendly. Talk like a supportive friend who happens to know a lot about fitness.
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
    
    // Check for fitness-related keywords
    const fitnessKeywords = [
      'workout', 'exercise', 'gym', 'fitness', 'run', 'running',
      'weight', 'strength', 'cardio', 'muscle', 'train', 'training',
      'bench press', 'squat', 'deadlift', 'push-up', 'pull-up',
      'diet', 'nutrition', 'protein', 'calories', 'macro',
      'stretch', 'mobility', 'injury', 'recovery'
    ];
    
    return fitnessKeywords.some(keyword => content.includes(keyword));
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
    
    // Highest confidence: explicit fitness questions with details
    if ((content.includes('workout') && content.includes('plan')) ||
        (content.includes('bench press') && /\d+/.test(content)) ||
        (content.includes('run') && content.includes('mile')) ||
        (content.includes('gym') && content.includes('routine'))) {
      return 0.9;
    }
    
    // Medium confidence: general fitness questions
    if (content.includes('workout') ||
        content.includes('exercise') ||
        content.includes('gym') ||
        content.includes('strength training')) {
      return 0.7;
    }
    
    // Lower confidence: potential fitness questions
    if (content.includes('protein') ||
        content.includes('weight') ||
        content.includes('stronger') ||
        content.includes('health')) {
      return 0.4;
    }
    
    return 0.1;
  }
  
  /**
   * Process a conversation
   * @param {Array} messages - Message history
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Response
   */
  async process(messages, userId) {
    console.log('FitnessSpecialist: Processing request');
    
    try {
      // Add fitness-specific context to the messages
      const fitnessContext = this.createFitnessContext(messages);
      
      // Create the messages array with system prompt
      const completeMessages = [
        {
          role: 'system',
          content: this.systemPrompt + fitnessContext
        },
        ...messages
      ];
      
      // Call OpenAI
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: completeMessages,
        temperature: 0.7,
        max_tokens: 800
      });
      
      // If the response includes a fitness goal, we may want to route to ClaudeCodeSpecialist
      // for database operations (future feature)
      
      return {
        message: completion.choices[0].message,
        usage: completion.usage,
        model: completion.model,
        specialist: this.name
      };
    } catch (error) {
      console.error('Error in FitnessSpecialist:', error);
      
      return {
        message: {
          role: 'assistant',
          content: "I'm having trouble with my fitness expertise right now. Could you try asking your question differently?"
        },
        specialist: this.name,
        model: 'error-fallback'
      };
    }
  }
  
  /**
   * Create fitness-specific context
   * @param {Array} messages - Message history
   * @returns {string} - Fitness context
   */
  createFitnessContext(messages) {
    // Extract keywords from messages to provide relevant context
    const userMessages = messages.filter(m => m.role === 'user');
    const allUserContent = userMessages.map(m => m.content.toLowerCase()).join(' ');
    
    // Check for specific fitness domains
    let context = '';
    
    if (allUserContent.includes('bench press') || 
        allUserContent.includes('deadlift') || 
        allUserContent.includes('squat')) {
      // Add strength training context
      context += `
        STRENGTH TRAINING CONTEXT:
        - For beginners, focus on proper form over weight
        - Recommend starting with 3 sets of 8-12 reps for hypertrophy
        - For strength, suggest 5 sets of 3-5 reps with heavier weights
        - Common progression: add 5lbs to upper body lifts and 10lbs to lower body lifts per week
        - Typical bench press progression:
          * Beginner (0-3 months): 0.5-0.75x bodyweight
          * Intermediate (3-12 months): 0.75-1.25x bodyweight
          * Advanced (1+ years): 1.25-2x bodyweight
      `;
    }
    
    if (allUserContent.includes('run') || 
        allUserContent.includes('cardio') || 
        allUserContent.includes('endurance')) {
      // Add cardio context
      context += `
        CARDIO TRAINING CONTEXT:
        - Beginner runners should start with walk/run intervals
        - Suggest 3-4 cardio sessions per week with rest days between
        - Progressive overload: increase distance by 10% per week maximum
        - Couch to 5K is a good starting program for new runners
        - Heart rate training zones:
          * Zone 1 (50-60% max HR): Recovery
          * Zone 2 (60-70% max HR): Endurance building
          * Zone 3 (70-80% max HR): Aerobic development
          * Zone 4 (80-90% max HR): Lactate threshold
          * Zone 5 (90-100% max HR): Maximum performance
      `;
    }
    
    if (allUserContent.includes('diet') || 
        allUserContent.includes('nutrition') || 
        allUserContent.includes('protein')) {
      // Add nutrition context
      context += `
        NUTRITION CONTEXT:
        - Protein recommendation: 0.8-1g per pound of bodyweight for strength training
        - Caloric surplus of 250-500 calories for muscle gain
        - Caloric deficit of 250-500 calories for fat loss
        - Emphasize whole foods over supplements
        - Suggest meal timing around workouts for optimal recovery
        - Basic macronutrient splits:
          * Balanced: 40% carbs, 30% protein, 30% fat
          * Fat loss: 25% carbs, 40% protein, 35% fat
          * Muscle gain: 50% carbs, 25% protein, 25% fat
      `;
    }
    
    return context;
  }
}

module.exports = FitnessSpecialist;