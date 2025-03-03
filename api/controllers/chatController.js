const ChatSession = require('../models/Chat');
const Goal = require('../models/Goal');
const Task = require('../models/Task');
const openaiService = require('../services/openaiService');
const pineconeService = require('../services/pineconeService');

/**
 * Get all chat sessions for a user
 */
exports.getChatSessions = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all chat sessions for this user
    const sessions = await ChatSession.find({ 
      user: userId 
    }).sort({ updatedAt: -1 });
    
    // Format for client response
    const formattedSessions = sessions.map(session => ({
      id: session._id,
      title: session.title,
      lastMessage: session.messages.length > 0 
        ? session.messages[session.messages.length - 1].content.substring(0, 100) 
        : '',
      messageCount: session.messages.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    }));
    
    res.json({
      success: true,
      sessions: formattedSessions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching chat sessions',
      error: error.message
    });
  }
};

/**
 * Get a single chat session by ID
 */
exports.getChatSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const sessionId = req.params.id;
    
    // Find the chat session
    const session = await ChatSession.findOne({
      _id: sessionId,
      user: userId
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found'
      });
    }
    
    res.json({
      success: true,
      session: {
        id: session._id,
        title: session.title,
        messages: session.messages,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching chat session',
      error: error.message
    });
  }
};

/**
 * Create a new chat session
 */
exports.createChatSession = async (req, res) => {
  try {
    console.log('====================================================');
    console.log('CREATE CHAT SESSION: Beginning process');
    
    const userId = req.user._id;
    console.log('User ID:', userId, 'User:', req.user);
    
    const { title, initialMessage } = req.body;
    console.log('Creating chat session with title:', title);
    console.log('Initial message:', initialMessage);
    
    try {
      // Create a new chat session
      const session = new ChatSession({
        user: userId,
        title: title || undefined,
        messages: initialMessage ? [
          {
            role: 'user',
            content: initialMessage,
            timestamp: new Date()
          }
        ] : []
      });
      
      console.log('Created new chat session object with ID:', session._id);
      
      // Save the session
      await session.save();
      console.log('Saved chat session to database');
      
      // If there's an initial message, get AI response
      if (initialMessage) {
        console.log('Processing initial message with OpenAI service...');
        
        try {
          // Process with OpenAI
          let response;
          let errorOccurred = false;
          try {
            response = await openaiService.processChat(session.messages, userId);
            console.log('OpenAI response received:', response.message.content.substring(0, 50) + '...');
            
            // Add assistant response to session
            session.messages.push({
              role: 'assistant',
              content: response.message.content,
              timestamp: new Date(),
              metadata: {
                model: response.model
              }
            });
          } catch (openaiError) {
            console.error('Error with OpenAI service, but continuing with error message:', openaiError.message);
            errorOccurred = true;
            
            // Create a fallback message
            session.messages.push({
              role: 'assistant',
              content: "I'm sorry, there was an issue processing your message. Please try again.",
              timestamp: new Date(),
              metadata: {
                error: true
              }
            });
          }
          
          // Save the updated session
          await session.save();
          console.log('Saved updated session with AI response');
          
          // Store messages in Pinecone for long-term memory
          try {
            console.log('Storing messages in Pinecone...');
            
            await pineconeService.storeChatMemory({ 
              role: 'user', 
              content: initialMessage 
            }, userId, session._id);
            
            await pineconeService.storeChatMemory({ 
              role: 'assistant', 
              content: response.message.content 
            }, userId, session._id);
            
            console.log('Successfully stored messages in Pinecone');
          } catch (pineconeError) {
            console.error('Error storing messages in Pinecone:', pineconeError);
            // Continue even if Pinecone fails
          }
        } catch (openaiError) {
          console.error('OpenAI processing error:', openaiError);
          // Send error back to client but still return the session
          res.status(201).json({
            success: true,
            message: 'Chat session created but OpenAI processing failed',
            openaiError: openaiError.message,
            session: {
              id: session._id,
              title: session.title,
              messages: session.messages,
              createdAt: session.createdAt,
              updatedAt: session.updatedAt
            }
          });
          return;
        }
      }
      
      console.log('Sending successful response');
      res.status(201).json({
        success: true,
        message: 'Chat session created',
        session: {
          id: session._id,
          title: session.title,
          messages: session.messages,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        },
        openaiError: errorOccurred ? "Error occurred processing message with OpenAI" : null
      });
    } catch (dbError) {
      console.error('Database error:', dbError);
      res.status(500).json({
        success: false,
        message: 'Error saving chat session to database',
        error: dbError.message
      });
    }
  } catch (error) {
    console.error('Unexpected error in createChatSession:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating chat session',
      error: error.message
    });
  } finally {
    console.log('====================================================');
  }
};

/**
 * Send a message in a chat session
 */
exports.sendMessage = async (req, res) => {
  try {
    console.log('====================================================');
    console.log('SEND MESSAGE: Beginning process');
    
    const userId = req.user._id;
    const sessionId = req.params.id;
    const { message } = req.body;
    
    console.log('User ID:', userId);
    console.log('Session ID:', sessionId);
    console.log('Message:', message?.substring(0, 50) + (message?.length > 50 ? '...' : ''));
    
    if (!message || typeof message !== 'string' || message.trim() === '') {
      console.log('Error: Empty message');
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    // Find the chat session
    console.log('Finding chat session...');
    let session;
    try {
      session = await ChatSession.findOne({
        _id: sessionId,
        user: userId
      });
    } catch (findError) {
      console.error('Error finding chat session:', findError);
      return res.status(500).json({
        success: false,
        message: 'Database error finding chat session',
        error: findError.message
      });
    }
    
    if (!session) {
      console.log('Chat session not found');
      return res.status(404).json({
        success: false,
        message: 'Chat session not found'
      });
    }
    
    console.log('Chat session found, message count:', session.messages.length);
    
    // Add user message to session
    console.log('Adding user message to session');
    session.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    
    // Save to update session
    try {
      console.log('Saving session with new user message');
      await session.save();
    } catch (saveError) {
      console.error('Error saving session with user message:', saveError);
      return res.status(500).json({
        success: false,
        message: 'Error saving user message',
        error: saveError.message
      });
    }
    
    // Store user message in Pinecone
    try {
      console.log('Storing user message in Pinecone');
      await pineconeService.storeChatMemory({ 
        role: 'user', 
        content: message 
      }, userId, sessionId);
    } catch (pineconeError) {
      console.error('Error storing user message in Pinecone:', pineconeError);
      // Continue even if Pinecone fails
    }
    
    // Get relevant memories from Pinecone for context
    let relevantMemories = [];
    try {
      console.log('Retrieving relevant memories from Pinecone');
      relevantMemories = await pineconeService.getRelevantMemories(message, userId);
      console.log('Retrieved', relevantMemories.length, 'relevant memories');
    } catch (memoriesError) {
      console.error('Error retrieving memories:', memoriesError);
      // Continue without memories
    }
    
    // Process with OpenAI
    let response;
    let openaiError = null;
    try {
      console.log('Processing with OpenAI...');
      response = await openaiService.processChat(session.messages, userId);
      console.log('OpenAI response received');
    } catch (error) {
      console.error('OpenAI processing error:', error);
      openaiError = error;
      
      // Instead of failing, continue with a fallback response
      response = {
        message: {
          role: 'assistant',
          content: "I'm sorry, I'm having trouble processing your request right now. Could you try again or rephrase your message?"
        },
        model: 'error-fallback',
        usage: { total_tokens: 0 }
      };
    }
    
    // Add assistant response to session
    console.log('Adding assistant response to session');
    session.messages.push({
      role: 'assistant',
      content: response.message.content,
      timestamp: new Date(),
      metadata: {
        relevantMemories: relevantMemories.length,
        model: response.model,
        usage: response.usage,
        error: openaiError ? true : false
      }
    });
    
    // Save the updated session
    try {
      console.log('Saving session with assistant response');
      await session.save();
    } catch (saveError) {
      console.error('Error saving session with assistant response:', saveError);
      // Still return the response to the user even if saving fails
    }
    
    // Store assistant message in Pinecone
    try {
      console.log('Storing assistant message in Pinecone');
      await pineconeService.storeChatMemory({ 
        role: 'assistant', 
        content: response.message.content 
      }, userId, sessionId);
    } catch (pineconeError) {
      console.error('Error storing assistant message in Pinecone:', pineconeError);
      // Continue even if Pinecone fails
    }
    
    console.log('Sending response to client');
    res.json({
      success: true,
      message: 'Message sent',
      response: {
        role: 'assistant',
        content: response.message.content,
        timestamp: new Date(),
        metadata: {
          model: response.model,
          error: openaiError ? true : false
        }
      },
      openaiError: openaiError ? openaiError.message : null
    });
  } catch (error) {
    console.error('Unexpected error in sendMessage:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  } finally {
    console.log('====================================================');
  }
};

/**
 * Delete a chat session
 */
exports.deleteChatSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const sessionId = req.params.id;
    
    // Find and delete the chat session
    const session = await ChatSession.findOneAndDelete({
      _id: sessionId,
      user: userId
    });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Chat session not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Chat session deleted'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting chat session',
      error: error.message
    });
  }
};

// Helper function to check if message is about creating a goal
async function checkForGoalCreation(message, history) {
  // Get OpenAI to determine if this is a goal creation intent
  if (typeof message !== 'string') return false;
  
  // Create full context for analysis
  const fullHistory = [...history, { role: 'user', content: message }];
  
  try {
    // Use OpenAI to analyze the intent
    const openaiService = require('../services/openaiService');
    
    const analysisMessages = [
      {
        role: 'system',
        content: `You are helping determine if the user wants to create a goal. 
        Analyze ONLY the user's request and determine if they are:
        1. Explicitly asking to create/add/save a goal
        2. Confirming a goal creation after we suggested one
        3. Providing specific goal details that should be saved
        
        Respond with ONLY a JSON object: {"isGoalCreation": true/false, "confidence": 0.0-1.0}
        Do not include any explanation or other text.`
      },
      ...fullHistory.slice(-3), // Just the most recent messages for context
      {
        role: 'user',
        content: 'Is the user trying to create a goal? Return only JSON.'
      }
    ];
    
    const analysis = await openaiService.processChat(analysisMessages, 'system');
    
    // Extract the response
    let result;
    try {
      // Try to find JSON in the response
      const content = analysis.message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
        console.log('Goal creation intent analysis:', result);
        
        if (result.isGoalCreation && result.confidence > 0.7) {
          return true;
        }
      }
    } catch (parseError) {
      console.error('Error parsing AI intent analysis JSON:', parseError);
    }
    
    // Fallback to simple checks if AI analysis failed
    const content = message.toLowerCase();
    
    // Direct goal creation statements
    if ((content.includes('add') || content.includes('create') || content.includes('set')) && 
        content.includes('goal')) {
      return true;
    }
    
    // Specific fitness goals with metrics
    if ((content.includes('bench press') || content.includes('deadlift') || content.includes('squat')) && 
        /\d+\s*(lbs|pounds|kg)/.test(content)) {
      return true;
    }
    
    // Check for simple confirmation to a goal prompt
    if (history.length > 0) {
      const lastAssistantMsg = [...history].reverse().find(m => m.role === 'assistant');
      if (lastAssistantMsg) {
        const assistantContent = lastAssistantMsg.content.toLowerCase();
        
        // Check if this is a simple confirmation
        if (['yes', 'yeah', 'yep', 'okay', 'ok', 'sure', 'correct', 'sounds good'].includes(content.trim())) {
          // Check if the last message was about a goal
          if (assistantContent.includes('goal') || 
              assistantContent.includes('look right') ||
              (assistantContent.includes('bench press') && assistantContent.includes('reps'))) {
            return true;
          }
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error in goal intent detection:', error);
    
    // Fallback to basic detection
    const content = message.toLowerCase();
    return content.includes('add goal') || 
           content.includes('create goal') || 
           content.includes('save goal') ||
           content.includes('set goal');
  }
}

// Helper function to extract goal details from conversation
async function extractGoalDetails(message, history) {
  try {
    // Use OpenAI to extract goal details
    const openaiService = require('../services/openaiService');
    
    // Create full context for analysis
    const fullHistory = [...history, { role: 'user', content: message }];
    
    const extractionMessages = [
      {
        role: 'system',
        content: `You are an AI that extracts goal information from conversations.
        
        Extract the following from the conversation:
        - title: The specific goal (e.g., "Bench press 225 lbs for 8 reps") 
        - category: Use "health" for fitness goals (valid categories: career, health, personal, financial, other)
        - deadline: When they want to achieve it (e.g., "end of year")
        - description: Brief description of the goal
        
        Return ONLY a JSON object like:
        {
          "title": "...",
          "category": "health",  // Must be one of: career, health, personal, financial, other
          "deadline": "...",
          "description": "..."
        }
        
        Be as specific as possible and include all measurable details (weights, reps, etc.).`
      },
      ...fullHistory.slice(-5), // Use last 5 messages for context
      {
        role: 'user',
        content: 'Extract the goal information from our conversation as JSON only.'
      }
    ];
    
    const extraction = await openaiService.processChat(extractionMessages, 'system');
    
    // Try to parse JSON from the response
    try {
      const content = extraction.message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        const goalData = JSON.parse(jsonMatch[0]);
        console.log('Extracted goal data using AI:', goalData);
        
        // Ensure we have a valid category
        if (goalData.category === 'fitness') {
          goalData.category = 'health';
        }
        
        return goalData;
      }
    } catch (parseError) {
      console.error('Error parsing goal extraction JSON:', parseError);
    }
  } catch (error) {
    console.error('Error in AI goal extraction:', error);
  }
  
  // Fallback to manual extraction if AI fails
  const allMessages = [...history, { role: 'user', content: message }];
  const allContent = allMessages.map(m => m.content.toLowerCase()).join(' ');
  
  // Default goal data
  const goalData = {
    title: 'Fitness goal',
    category: 'health',  // Use valid category
    deadline: 'end of year',
    description: ''
  };
  
  // Look for bench press goals with specific weights
  if (allContent.includes('bench press') || allContent.includes('bench')) {
    // Extract weight
    const weightMatch = allContent.match(/(\d+)\s*(lbs|pounds|kg|lb)/i);
    if (weightMatch) {
      const weight = weightMatch[1];
      const unit = weightMatch[2];
      
      // Look for rep count
      const repMatch = allContent.match(/(\d+)\s*reps/i);
      const reps = repMatch ? repMatch[1] : '';
      
      goalData.title = `Bench press ${weight} ${unit}${reps ? ` for ${reps} reps` : ''}`;
      goalData.description = `Strength training goal to improve bench press to ${weight} ${unit}`;
    } else {
      goalData.title = 'Improve bench press strength';
    }
  }
  
  // Look for deadlines
  const deadlineMatch = allContent.match(/by\s+(end\s+of\s+\d{4}|end\s+of\s+year|end\s+of\s+the\s+year|next\s+\w+|\w+\s+\d{4})/i);
  if (deadlineMatch) {
    goalData.deadline = deadlineMatch[1];
  }
  
  return goalData;
}

/**
 * Handle direct chat requests (without authentication)
 */
exports.directChat = async (req, res) => {
  try {
    console.log('DIRECT CHAT ENDPOINT CALLED');
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }
    
    console.log('Direct chat message received:', message.substring(0, 100) + '...');
    console.log('===============================================');
    
    // Get conversation history from request if available
    const conversationHistory = req.body.history || [];
    
    // Append the new message to the history
    const updatedHistory = [...conversationHistory, { role: 'user', content: message }];
    
    // Use a fixed user ID for direct chat
    const directUserId = 'direct_chat_user';
    
    // Log complete conversation for debugging
    const fs = require('fs');
    const logPath = '/Users/charlier/Documents/marcus/aurelius_website/logs/direct-chat.log';
    try {
      fs.appendFileSync(logPath, 
        `\n\n---------- NEW REQUEST (${new Date().toISOString()}) ----------\n` +
        `User message: ${message}\n` +
        `Complete history: ${JSON.stringify(updatedHistory, null, 2)}\n`
      );
    } catch (fsError) {
      console.error('Error writing to log file:', fsError);
    }
    
    // Process with the enhanced AI architecture
    try {
      // Process directly with the AI service
      const response = await openaiService.processChat(updatedHistory, directUserId);
      console.log('Enhanced AI response received:', 
        response.message.content.substring(0, 100) + '...');
      
      // Check if a goal was created (from response metadata)
      const goalCreated = response.goalCreated || false;
      const goalInfo = response.goalInfo || null;
      
      console.log('Response from AI service:', {
        model: response.model,
        agent: response.agent,
        goalCreated: goalCreated,
        goalInfo: goalInfo ? 'present' : 'null'
      });
      
      // Format the response for the client
      const result = {
        aiMessage: response.message.content,
        model: response.model || 'gpt-3.5-turbo',
        agent: response.agent || 'general',
        goalCreated: goalCreated,
        goalInfo: goalInfo
      };
      
      return res.json({
        success: true,
        result
      });
    } catch (error) {
      console.error('Error processing with enhanced AI:', error);
      
      // Return a friendly error message
      return res.status(500).json({
        success: false,
        error: 'Something went wrong while processing your message',
        details: error.message
      });
    }
  } catch (error) {
    console.error('Unexpected error in directChat:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing direct chat',
      error: error.message
    });
  }
};

// Helper function to create goals directly from chat
// This allows GPT to seamlessly create goals without complex routing
async function createGoalFromChat(userId, goalData) {
  try {
    console.log('Creating goal from chat:', goalData);
    
    // Get a valid user ID for direct chat users
    if (userId === 'direct_chat_user') {
      const User = require('../models/User');
      const directChatUserId = await User.createDirectChatUser();
      if (directChatUserId) {
        userId = directChatUserId;
      } else {
        return { success: false, message: 'Failed to create user for goal' };
      }
    }
    
    // Create the goal with the extracted data
    const Goal = require('../models/Goal');
    
    // Map fitness goals to valid 'health' category
    let category = 'other';
    if (goalData.category) {
      if (goalData.category.toLowerCase() === 'fitness') {
        category = 'health';
      } else if (['career', 'health', 'personal', 'financial'].includes(goalData.category.toLowerCase())) {
        category = goalData.category.toLowerCase();
      }
    }
    
    const goal = new Goal({
      user: userId,
      title: goalData.title || 'Fitness goal',
      description: goalData.description || '',
      category: category,
      priority: goalData.priority || 'medium',
      status: 'in progress',
      deadline: goalData.deadline ? 
        (goalData.deadline.toLowerCase() === 'end of year' ? 
          new Date(new Date().getFullYear(), 11, 31) : // Dec 31 of current year
          new Date(goalData.deadline)) : 
        new Date(new Date().getFullYear(), 11, 31) // Default to end of year
    });
    
    // Save the goal
    await goal.save();
    console.log('Successfully created goal:', goal._id);
    
    return { success: true, goal };
  } catch (error) {
    console.error('Error creating goal from chat:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Create a goal or task based on chat instruction
 */
exports.createFromChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, data } = req.body;
    
    if (!type || !data) {
      return res.status(400).json({
        success: false,
        message: 'Type and data are required',
      });
    }
    
    // Handle goal creation
    if (type === 'goal') {
      const { title, description, category, priority, deadline } = data;
      
      if (!title) {
        return res.status(400).json({
          success: false,
          message: 'Goal title is required'
        });
      }
      
      // Create a new goal
      const goal = new Goal({
        user: userId,
        title,
        description,
        category: category || 'other',
        priority: priority || 'medium',
        deadline: deadline ? new Date(deadline) : undefined
      });
      
      // Save the goal
      await goal.save();
      
      // Store in Pinecone for memory
      try {
        await pineconeService.storeMemory({
          id: `goal-${goal._id}`,
          type: 'goal',
          text: `Goal: ${title} - ${description || ''}`,
          metadata: {
            goalId: goal._id,
            category: goal.category,
            priority: goal.priority
          }
        }, userId);
      } catch (pineconeError) {
        console.error('Error storing goal in Pinecone:', pineconeError);
        // Continue even if Pinecone fails
      }
      
      return res.status(201).json({
        success: true,
        message: 'Goal created successfully from chat',
        goal
      });
    }
    
    // Handle task creation
    else if (type === 'task') {
      const { title, description, priority, dueDate, goalId, tags } = data;
      
      if (!title) {
        return res.status(400).json({
          success: false,
          message: 'Task title is required'
        });
      }
      
      // Create a new task
      const task = new Task({
        user: userId,
        goal: goalId || undefined,
        title,
        description,
        priority: priority || 'medium',
        dueDate: dueDate ? new Date(dueDate) : undefined,
        tags: tags || [],
        aiSuggested: true
      });
      
      // Save the task
      await task.save();
      
      // If this task is linked to a goal, update the goal
      if (goalId) {
        const goal = await Goal.findById(goalId);
        if (goal && goal.user.toString() === userId.toString()) {
          goal.tasks.push(task._id);
          await goal.save();
          await goal.updateProgress();
        }
      }
      
      // Store in Pinecone for memory
      try {
        await pineconeService.storeMemory({
          id: `task-${task._id}`,
          type: 'task',
          text: `Task: ${title} - ${description || ''}`,
          metadata: {
            taskId: task._id,
            goalId: task.goal || undefined,
            priority: task.priority
          }
        }, userId);
      } catch (pineconeError) {
        console.error('Error storing task in Pinecone:', pineconeError);
        // Continue even if Pinecone fails
      }
      
      return res.status(201).json({
        success: true,
        message: 'Task created successfully from chat',
        task
      });
    }
    
    else {
      return res.status(400).json({
        success: false,
        message: 'Invalid type. Must be "goal" or "task"'
      });
    }
  } catch (error) {
    console.error('Error in createFromChat:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating item from chat',
      error: error.message
    });
  }
};