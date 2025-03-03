const OpenAI = require('openai');
const config = require('../config');
const aiService = require('./ai');

// Initialize OpenAI client with debug logging
console.log('Initializing OpenAI client with API key:', config.OPENAI_API_KEY.substring(0, 10) + '...[truncated]');

// Get the API key
const apiKey = config.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: apiKey,
  dangerouslyAllowBrowser: true // This is just for testing - normally you'd keep API calls server-side only
});

/**
 * Process chat message with our enhanced multi-tier AI architecture
 * @param {Array} messages - Chat history
 * @param {string} userId - User ID
 * @returns {Object} - AI response
 */
exports.processChat = async (messages, userId) => {
  try {
    console.log('===============================================');
    console.log('OpenAI SERVICE: Processing chat with userId:', userId);
    console.log('Messages received:', messages.length);
    
    try {
      // Special case - if placeholder key is still in place
      if (apiKey === "sk-placeholder-replace-with-valid-openai-key") {
        console.error('Placeholder API key detected. Using fallback response.');
        throw new Error('Placeholder API key detected. Please update config.js with your key.');
      }
      
      // Send to our enhanced multi-tier AI architecture
      // The ConversationRouter will analyze intent and route to appropriate agents
      console.log('Using enhanced multi-tier AI architecture with fluid conversation routing');
      return await aiService.processConversation(messages, userId);
      
    } catch (apiError) {
      console.error('AI processing failed:', apiError.message);
      console.log('Falling back to local response generation...');
      
      // Generate a fallback response based on the last user message
      const lastUserMessage = messages.length > 0 ? 
        messages[messages.length-1].content : 'Hello';
      
      const fallbackResponse = generateFallbackResponse(lastUserMessage);
      
      return {
        message: {
          role: 'assistant',
          content: fallbackResponse
        },
        usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 },
        model: 'fallback'
      };
    }
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw new Error(`OpenAI API error: ${error.message}`);
  } finally {
    console.log('===============================================');
  }
};

/**
 * Generate a fallback response when API calls fail
 * @param {string} userMessage - The user's message
 * @returns {string} - A generated response
 */
function generateFallbackResponse(userMessage) {
  userMessage = userMessage.toLowerCase();
  console.log("⚠️ USING FALLBACK RESPONSE GENERATION INSTEAD OF OPENAI API ⚠️");
  
  // Goal setting patterns
  if (userMessage.includes('goal') || userMessage.includes('objective') || userMessage.includes('target') || 
      userMessage.includes('achieve') || userMessage.includes('accomplish')) {
    return "Setting clear goals is important! Here are some tips for effective goal-setting:\n\n- Make your goals **specific and measurable**\n- Set **realistic timeframes**\n- Break large goals into smaller tasks\n- Track your progress regularly\n\nWould you like to add a new goal to your dashboard?";
  }
  
  // Greeting patterns
  if (userMessage.includes('hello') || userMessage.includes('hi') || userMessage.includes('hey') || 
      userMessage.includes('morning') || userMessage.includes('afternoon') || userMessage.includes('evening') ||
      userMessage.match(/^(hi|hello|hey)[\s\.,!]*$/)) {
    return "Hello! I'm Marcus, your AI life coach and cofounder assistant. How can I help you today? I can assist with goal setting, task management, productivity, or provide insights from your logs.";
  }
  
  // Startup/business patterns
  if (userMessage.includes('startup') || userMessage.includes('business') || userMessage.includes('company') ||
      userMessage.includes('founder') || userMessage.includes('entrepreneurship') || userMessage.includes('venture')) {
    return "Building a startup requires both vision and execution. Here are key areas to focus on:\n\n- **Customer validation**: Test your idea with real potential users\n- **MVP development**: Create a minimum viable product to start learning\n- **Metrics**: Establish clear KPIs to track progress\n- **Go-to-market strategy**: Plan how to reach your first customers\n\nWhich of these areas would you like to explore further?";
  }
  
  // Productivity/motivation patterns
  if (userMessage.includes('motivation') || userMessage.includes('stuck') || userMessage.includes('procrastinating') ||
      userMessage.includes('productivity') || userMessage.includes('focus') || userMessage.includes('distracted')) {
    return "It sounds like you might be experiencing some challenges with motivation. This is completely normal! Here are some strategies that might help:\n\n- **Start small**: Begin with just 5 minutes of focused work\n- **Environment design**: Remove distractions from your workspace\n- **Time blocking**: Use the Pomodoro technique (25 min work, 5 min break)\n- **Purpose reconnection**: Remind yourself of your deeper reason behind your goals\n\nWould you like to discuss what might be causing your motivational challenges?";
  }
  
  // Task management patterns
  if (userMessage.includes('task') || userMessage.includes('todo') || userMessage.includes('to-do') ||
      userMessage.includes('organize') || userMessage.includes('plan') || userMessage.includes('schedule')) {
    return "Effective task management is key to productivity. Here are some approaches I recommend:\n\n- **Prioritization**: Use the Eisenhower Matrix (urgent/important)\n- **Time estimation**: Be realistic about how long tasks take\n- **Batching**: Group similar tasks together\n- **Buffer time**: Leave gaps between tasks for unexpected issues\n\nWould you like help organizing your current tasks or creating a new plan?";
  }
  
  // Reflection/journaling patterns
  if (userMessage.includes('journal') || userMessage.includes('reflect') || userMessage.includes('thinking about') ||
      userMessage.includes('log') || userMessage.includes('diary') || userMessage.includes('record')) {
    return "Reflection and journaling are powerful practices for growth and self-awareness. I recommend:\n\n- **Daily highlights**: Note 3 key events or insights each day\n- **Gratitude**: Record things you're thankful for\n- **Challenges**: Document obstacles and how you responded\n- **Patterns**: Look for recurring themes in your experiences\n\nWould you like to create a new log entry or review insights from your past entries?";
  }
  
  // General response for anything else
  return "I understand what you're saying. As your AI coach and assistant, I'm here to help with goal-setting, productivity, task management, and providing insights. Could you tell me more specifically what you're looking to accomplish today?";
}

/**
 * Generate insights from user logs
 * @param {Array} logs - User logs
 * @returns {Object} - AI generated insights
 */
exports.generateInsights = async (logs, goals, userId) => {
  try {
    // Prepare prompt for insights generation
    const prompt = `
As Marcus, analyze the following user logs and goals to generate insights:

LOGS:
${JSON.stringify(logs, null, 2)}

GOALS:
${JSON.stringify(goals, null, 2)}

Please provide:
1. Key patterns and trends in the user's habits
2. Correlations between activities and mood/productivity
3. Personalized suggestions for improvement
4. Goal alignment analysis (how activities align with stated goals)
5. Productivity insights

Format your response as a JSON object with the following structure:
{
  "patterns": ["pattern1", "pattern2", ...],
  "correlations": ["correlation1", "correlation2", ...],
  "suggestions": ["suggestion1", "suggestion2", ...],
  "goalInsights": ["insight1", "insight2", ...],
  "productivityTips": ["tip1", "tip2", ...]
}
`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { 
          role: 'system', 
          content: `You are Marcus, an AI Assistant in a goal-tracking app. 
            Your task is to analyze user data and provide actionable insights.` 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    });
    
    // Parse JSON response
    const insights = JSON.parse(completion.choices[0].message.content);
    
    return insights;
  } catch (error) {
    console.error('Error generating insights:', error);
    throw new Error(`Insights generation error: ${error.message}`);
  }
};

/**
 * Suggest tasks based on goals
 * @param {Object} goal - The goal
 * @returns {Array} - Suggested tasks
 */
exports.suggestTasks = async (goal) => {
  try {
    const prompt = `
As Marcus, suggest 3-5 specific, actionable tasks that would help achieve this goal:

GOAL:
${JSON.stringify(goal, null, 2)}

Format your response as a JSON array of task objects with the following structure:
[
  {
    "title": "Task title",
    "description": "Task description",
    "estimatedDuration": {
      "value": 30,
      "unit": "minutes"
    },
    "priority": "high/medium/low"
  },
  ...
]
`;

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { 
          role: 'system', 
          content: `You are Marcus, an AI Assistant in a goal-tracking app.
            Your task is to suggest specific, actionable tasks to help achieve goals.` 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    });
    
    // Parse JSON response
    const suggestedTasks = JSON.parse(completion.choices[0].message.content);
    
    return suggestedTasks;
  } catch (error) {
    console.error('Error suggesting tasks:', error);
    throw new Error(`Task suggestion error: ${error.message}`);
  }
};

module.exports = exports;