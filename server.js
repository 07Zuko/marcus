const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const config = require('./api/config');

// Check if OpenAI API key is present
if (!config.OPENAI_API_KEY || 
    config.OPENAI_API_KEY === "sk-placeholder-replace-with-valid-openai-key") {
  console.warn('\x1b[33m%s\x1b[0m', '⚠️ WARNING: Missing OpenAI API key ⚠️');
  console.warn('\x1b[33m%s\x1b[0m', 'The application will run with fallback responses instead of actual OpenAI API calls.');
  console.warn('\x1b[33m%s\x1b[0m', 'To enable real AI responses, please update the OPENAI_API_KEY in api/config.js.');
} else {
  console.log('\x1b[32m%s\x1b[0m', '✅ OpenAI API key found, using for chat requests');
  console.log('\x1b[32m%s\x1b[0m', `API key starts with: ${config.OPENAI_API_KEY.substring(0, 10)}...`);
}

// Import routes
const authRoutes = require('./api/routes/auth');
const chatRoutes = require('./api/routes/chat');
const goalsRoutes = require('./api/routes/goals');
const tasksRoutes = require('./api/routes/tasks');
const insightsRoutes = require('./api/routes/insights');
const logsRoutes = require('./api/routes/logs');

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname)));

// Log all requests with more details
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  
  // Add special test endpoints
  if (req.url === '/api/test') {
    return res.json({ 
      success: true, 
      message: 'API is working correctly',
      mongoStatus: 'connected',
      time: new Date().toISOString()
    });
  }
  
  // OpenAI test endpoint
  if (req.url === '/api/test-openai') {
    try {
      // Import OpenAI service and run a basic test
      const openaiService = require('./api/services/openaiService');
      const result = {
        status: 'OpenAI module loaded successfully',
        apiKey: 'Configured with key: ' + (config.OPENAI_API_KEY ? 'Present (starts with ' + config.OPENAI_API_KEY.substring(0, 5) + '...)' : 'Missing'),
        time: new Date().toISOString()
      };
      
      return res.json({ 
        success: true, 
        message: 'OpenAI test endpoint',
        result
      });
    } catch (error) {
      return res.json({
        success: false,
        message: 'Error testing OpenAI',
        error: error.message
      });
    }
  }
  
  // Direct chat endpoint - accepts a message and returns an AI response
  if (req.url === '/api/direct-chat' && req.method === 'POST') {
    console.log("DIRECT CHAT ENDPOINT CALLED");
    
    // Use Express's built-in JSON parser since we added it as middleware
    const userMessage = req.body?.message;
    
    if (!userMessage) {
      console.log("No message provided in request body:", req.body);
      return res.json({
        success: false,
        message: 'No message provided in request body'
      });
    }
    
    console.log(`Direct chat message received: "${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}"`);
    
    // Call OpenAI with the user's message
    const openaiService = require('./api/services/openaiService');
    
    openaiService.processChat([
      { role: 'user', content: userMessage }
    ], 'direct_chat_user') // Using a fixed user ID
    .then(result => {
      console.log(`Direct chat response received from OpenAI: "${result.message.content.substring(0, 50)}..."`);
      
      res.json({
        success: true,
        message: 'Chat response generated',
        result: {
          aiMessage: result.message.content,
          model: result.model
        }
      });
    })
    .catch(error => {
      console.error('Error generating chat response:', error);
      
      res.json({
        success: false,
        message: 'Error generating chat response',
        error: error.message
      });
    });
    
    return; // Don't call next() since we're handling the response asynchronously
  }
  
  // OpenAI chat test endpoint
  if (req.url === '/api/test-openai-chat') {
    const openaiService = require('./api/services/openaiService');
    const testTime = new Date().toISOString();
    
    console.log(`[${testTime}] OpenAI test request received`);
    
    // Test with a simple message
    openaiService.processChat([
      { role: 'user', content: 'Hello, this is a test message. The time is ' + testTime + '. Please reply with a simple greeting and confirm you received this timestamp.' }
    ], '123456789012') // Using a dummy user ID
    .then(result => {
      console.log(`[${testTime}] OpenAI test SUCCESS`);
      console.log(`Message content: ${result.message.content.substring(0, 100)}...`);
      
      res.json({
        success: true,
        message: 'OpenAI chat test completed',
        testTime: testTime, 
        result: {
          aiMessage: result.message.content,
          model: result.model
        }
      });
    })
    .catch(error => {
      console.log(`[${testTime}] OpenAI test FAILED:`, error);
      
      res.json({
        success: false,
        message: 'OpenAI chat test failed',
        testTime: testTime,
        error: error.message
      });
    });
    
    return; // Don't call next() since we're handling the response asynchronously
  }
  
  next();
});

// Set up a flag to track if we're in fallback mode
let fallbackMode = false;

// Setup debug logging function
const debug = (...args) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] DEBUG:`, ...args);
};

// Create fallback routes for demo mode
const createFallbackRoute = (route) => {
  app.use(`/api/${route}`, (req, res) => {
    res.json({
      success: false,
      message: `API running in fallback mode. MongoDB connection is required for full ${route} functionality.`,
      fallbackMode: true,
      route: route
    });
  });
};

// Choose whether to use real routes or fallback routes based on MongoDB connection
const setupRoutes = (useFallback) => {
  if (useFallback) {
    console.log('Using fallback routes for all API endpoints');
    fallbackMode = true;
    
    // Set up fallback routes for all endpoints
    debug('Setting up fallback routes');
    createFallbackRoute('auth');
    createFallbackRoute('chat');
    createFallbackRoute('goals');
    createFallbackRoute('tasks');
    createFallbackRoute('insights');
    createFallbackRoute('logs');
  } else {
    console.log('Using real API routes');
    
    try {
      debug('Loading route modules...');
      
      // Load each module with error checking
      debug('Auth routes module:', typeof authRoutes);
      debug('Chat routes module:', typeof chatRoutes);
      debug('Goals routes module:', typeof goalsRoutes);
      debug('Tasks routes module:', typeof tasksRoutes);
      debug('Insights routes module:', typeof insightsRoutes);
      debug('Logs routes module:', typeof logsRoutes);
      
      // API routes
      debug('Setting up API routes');
      app.use('/api/auth', authRoutes);
      app.use('/api/chat', chatRoutes);
      app.use('/api/goals', goalsRoutes);
      app.use('/api/tasks', tasksRoutes);
      app.use('/api/insights', insightsRoutes);
      app.use('/api/logs', logsRoutes);
      
      debug('API routes setup complete');
    } catch (error) {
      console.error('Error setting up API routes:', error);
      console.log('Falling back to fallback mode due to route setup error');
      
      fallbackMode = true;
      createFallbackRoute('auth');
      createFallbackRoute('chat');
      createFallbackRoute('goals');
      createFallbackRoute('tasks');
      createFallbackRoute('insights');
      createFallbackRoute('logs');
    }
  }
};

// Catch-all routes should be set up AFTER the API routes
// We'll move them to be setup after the MongoDB connection setup

// Connect to MongoDB or use fallback mode
console.log('Attempting to connect to MongoDB...');
mongoose.connect(config.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => {
    console.log('Connected to MongoDB successfully!');
    // Set up routes with real API endpoints
    setupRoutes(false);
    
    // Explicitly serve index.html at the root path
    app.get('/', (req, res) => {
      console.log('Serving index.html from root path');
      res.sendFile(path.join(__dirname, 'index.html'));
    });
    
    // Serve index.html for all other routes (client-side routing)
    app.get('*', (req, res) => {
      console.log('Serving index.html for path:', req.path);
      res.sendFile(path.join(__dirname, 'index.html'));
    });
    
    // Start server
    app.listen(config.PORT, () => {
      console.log(`Server running on port ${config.PORT} with full functionality`);
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    console.log('Starting in fallback mode with limited functionality');
    
    // Set up routes with fallback endpoints
    setupRoutes(true);
    
    // Explicitly serve index.html at the root path
    app.get('/', (req, res) => {
      console.log('Serving index.html from root path');
      res.sendFile(path.join(__dirname, 'index.html'));
    });
    
    // Serve index.html for all other routes (client-side routing)
    app.get('*', (req, res) => {
      console.log('Serving index.html for path:', req.path);
      res.sendFile(path.join(__dirname, 'index.html'));
    });
    
    // Start server in fallback mode
    app.listen(config.PORT, () => {
      console.log(`Server running on port ${config.PORT} (fallback mode)`);
      console.log('The frontend will use simulated data instead of real database storage');
    });
  });