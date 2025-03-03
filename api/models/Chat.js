const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  relatedTo: {
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal'
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    }
  }
});

const chatSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    default: function() {
      return `Chat ${new Date().toLocaleDateString()}`;
    }
  },
  messages: [messageSchema],
  summary: {
    type: String
  },
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Update summary whenever messages are added
chatSessionSchema.pre('save', async function(next) {
  if (this.isModified('messages') && this.messages.length > 0) {
    this.updatedAt = new Date();
    
    // Auto-generate title from content if not set and there are messages
    if (!this.title || this.title.match(/^Chat \d{1,2}\/\d{1,2}\/\d{4}$/)) {
      const userMessages = this.messages.filter(m => m.role === 'user');
      if (userMessages.length > 0) {
        // Get first user message and create a title
        const firstMessage = userMessages[0].content;
        // Trim to max 50 chars
        this.title = firstMessage.substring(0, 50) + (firstMessage.length > 50 ? '...' : '');
      }
    }
  }
  next();
});

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

module.exports = ChatSession;