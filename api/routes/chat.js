const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticate } = require('../middlewares/auth');

// Direct chat endpoint (no authentication)
router.post('/direct-chat', chatController.directChat);

// Apply authentication middleware to all other chat routes
router.use(authenticate);

// Get all chat sessions
router.get('/', chatController.getChatSessions);

// Create a new chat session
router.post('/', chatController.createChatSession);

// Get a chat session by ID
router.get('/:id', chatController.getChatSession);

// Send a message in a chat session
router.post('/:id/messages', chatController.sendMessage);

// Delete a chat session
router.delete('/:id', chatController.deleteChatSession);

// Create goal or task from chat
router.post('/create-from-chat', chatController.createFromChat);

module.exports = router;