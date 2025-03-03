const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  goal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal'
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
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  dueDate: {
    type: Date
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  },
  tags: [{
    type: String,
    trim: true
  }],
  aiSuggested: {
    type: Boolean,
    default: false
  },
  estimatedDuration: {
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
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Middleware to run after task completion
taskSchema.pre('save', async function(next) {
  // If task completion status changed to true, set completedAt date
  if (this.isModified('completed') && this.completed) {
    this.completedAt = new Date();
  }
  next();
});

// Middleware to update the parent goal progress after saving
taskSchema.post('save', async function() {
  if (this.goal) {
    const Goal = mongoose.model('Goal');
    const goal = await Goal.findById(this.goal);
    if (goal) {
      await goal.updateProgress();
    }
  }
});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;