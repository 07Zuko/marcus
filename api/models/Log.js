const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['productivity', 'mood', 'health', 'work', 'personal', 'other'],
    default: 'other'
  },
  date: {
    type: Date,
    default: Date.now
  },
  duration: {
    value: {
      type: Number,
      min: 0
    },
    unit: {
      type: String,
      enum: ['minutes', 'hours', 'days'],
      default: 'minutes'
    }
  },
  rating: {
    type: Number,
    min: 1,
    max: 10
  },
  tags: [{
    type: String,
    trim: true
  }],
  relatedTo: {
    goalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Goal'
    },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    }
  },
  aiAnalysis: {
    insights: [String],
    suggestions: [String],
    patterns: [String],
    lastUpdated: Date
  }
}, { timestamps: true });

const Log = mongoose.model('Log', logSchema);

module.exports = Log;