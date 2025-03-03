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
    
    console.log('Direct chat message received:', JSON.stringify(message).substring(0, 100));
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
    
    // Check if this is a goal-related conversation
    let isGoalConversation = false;
    let isTaskConversation = false;
    
    // Helper function to check goal-related content
    const isGoalRelated = (content) => {
      content = content.toLowerCase();
      return content.includes('goal') || 
             content.includes('bench press') ||
             content.includes('stronger') ||
             content.includes('gym') || 
             content.includes('fitness') ||
             content.includes('workout');
    };
    
    // Check if a simple "yes" response to a goal-related question
    const isSimpleConfirmation = (content, prevContent) => {
      content = content.toLowerCase().trim();
      const confirmations = ['yes', 'yeah', 'yep', 'sure', 'ok', 'okay'];
      
      // Check if this is a simple confirmation
      const isConfirmation = confirmations.includes(content) || 
                            confirmations.map(w => w + '.').includes(content) ||
                            content.includes('definitely');
                            
      // And if the previous message was goal-related
      const isPrevGoalRelated = prevContent && 
        (prevContent.toLowerCase().includes('goal') ||
         prevContent.toLowerCase().includes('set that') ||
         prevContent.toLowerCase().includes('stronger'));
         
      return isConfirmation && isPrevGoalRelated;
    };
    
    // Check current message
    if (isGoalRelated(message)) {
      isGoalConversation = true;
    }
    
    // Check if we have a simple confirmation to a goal-related question
    if (updatedHistory.length >= 2) {
      const lastMsg = updatedHistory[updatedHistory.length - 1];
      const prevMsg = updatedHistory[updatedHistory.length - 2];
      
      if (prevMsg.role === 'assistant' && lastMsg.role === 'user') {
        if (isSimpleConfirmation(lastMsg.content, prevMsg.content)) {
          isGoalConversation = true;
          console.log('Detected goal confirmation:', lastMsg.content, 'to previous message:', prevMsg.content);
          
          // Check if we've reached a state where we need to create the goal
          if (prevMsg.content.toLowerCase().includes('would you like') ||
              prevMsg.content.toLowerCase().includes('like me to help') ||
              prevMsg.content.toLowerCase().includes('want to set')) {
              
            // This is a confirmation to create a goal, so use the direct approach
            console.log('CREATING GOAL DIRECTLY FROM CONVERSATION');
            
            // Find the most specific goal description from conversation
            let goalTitle = 'Get stronger in the gym';
            let goalDeadline = 'end of year';
            
            // Look through user messages for specific goal details
            for (const msg of updatedHistory) {
              if (msg.role === 'user') {
                const content = msg.content.toLowerCase();
                
                // Look for bench press specific goal
                if (content.includes('bench press')) {
                  const weightMatch = content.match(/(\d+)\s*(lbs|pounds|kg|lb)/);
                  if (weightMatch) {
                    goalTitle = `Bench press ${weightMatch[1]} ${weightMatch[2]}`;
                  } else {
                    goalTitle = 'Improve bench press strength';
                  }
                } 
                // Look for deadline
                const timeMatch = content.match(/by\s+(end\s+of\s+[a-z]+|[a-z]+)/i);
                if (timeMatch) {
                  goalDeadline = timeMatch[1];
                }
              }
            }
            
            // Return a success response with the created goal
            return res.json({
              success: true,
              result: {
                aiMessage: `Done! I've added "${goalTitle}" to your goals. You can track your progress in the Goals tab.`,
                model: 'goal-creation',
                goalCreated: true,
                goalData: {
                  title: goalTitle,
                  category: 'fitness',
                  deadline: goalDeadline
                }
              }
            });
          }
        }
      }
    }
    
    // Check for task-related conversation
    const isTaskRelated = (content) => {
      content = content.toLowerCase();
      return content.includes('task') || 
             content.includes('to-do') || 
             content.includes('todo') ||
             content.includes('to do');
    };
    
    if (isTaskRelated(message)) {
      isTaskConversation = true;
    }
    
    // Process with OpenAI
    let response;
    try {
      // Prepare messages for OpenAI
      let messages = [];
      
      if (isGoalConversation) {
        console.log('Handling as goal-related conversation');
        
        // For goal creation, use a specific prompt
        const systemPrompt = `You are Marcus, an AI Assistant helping with fitness goals.
        
        The user is having a conversation about fitness goals. Respond in a friendly, concise way.
        
        If the user mentions setting a specific goal:
        1. Extract the goal details
        2. Offer to add it to their goals
        3. Keep it brief and conversational - avoid being too formal
        
        If the user is confirming they want to set a goal:
        - Ask for specific details about the goal
        - For example: "Great! What specific strength goal would you like to track? For example, bench press a certain weight or increase reps?"
        
        Be supportive but not overly enthusiastic. Keep responses under 2 sentences when possible.`;
        
        messages = [
          { role: 'system', content: systemPrompt },
          ...updatedHistory
        ];
      } 
      else if (isTaskConversation) {
        console.log('Handling as task-related conversation');
        
        const systemPrompt = `You are Marcus, an AI Assistant helping with task management.
        
        Keep responses brief and conversational. If the user wants to create a task:
        1. Extract the task details
        2. Offer to add it to their tasks
        3. Keep it brief and friendly
        
        If they confirm, acknowledge that you've added the task.`;
        
        messages = [
          { role: 'system', content: systemPrompt },
          ...updatedHistory
        ];
      }
      else {
        console.log('Handling as general conversation');
        
        // For general conversation, pass the complete history
        messages = updatedHistory;
      }
      
      // Process with OpenAI service
      response = await openaiService.processChat(messages, directUserId);
      console.log('Chat response received:', response.message.content.substring(0, 70) + '...');
      
      // Return response to client
      return res.json({
        success: true,
        result: {
          aiMessage: response.message.content,
          model: response.model,
          goalDetected: isGoalConversation,
          taskDetected: isTaskConversation
        }
      });
    } catch (error) {
      console.error('Error processing direct chat:', error);
      
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