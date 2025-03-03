const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
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
    enum: ['career', 'health', 'personal', 'financial', 'other'],
    default: 'other'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  deadline: {
    type: Date
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  tasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  status: {
    type: String,
    enum: ['not started', 'in progress', 'completed', 'abandoned'],
    default: 'not started'
  },
  aiAnalysis: {
    strengths: [String],
    weaknesses: [String],
    suggestions: [String],
    lastUpdated: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Middleware to update progress based on related tasks
goalSchema.methods.updateProgress = async function() {
  const Task = mongoose.model('Task');
  const tasks = await Task.find({ _id: { $in: this.tasks } });
  
  if (tasks.length === 0) return;
  
  const completedTasks = tasks.filter(task => task.completed).length;
  this.progress = Math.round((completedTasks / tasks.length) * 100);
  
  // Update status based on progress
  if (this.progress === 0) {
    this.status = 'not started';
  } else if (this.progress === 100) {
    this.status = 'completed';
  } else {
    this.status = 'in progress';
  }
  
  await this.save();
};

const Goal = mongoose.model('Goal', goalSchema);

module.exports = Goal;