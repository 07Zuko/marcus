const Log = require('../models/Log');
const Goal = require('../models/Goal');
const Task = require('../models/Task');
const openaiService = require('../services/openaiService');

/**
 * Generate insights from user logs and goals
 */
exports.generateInsights = async (req, res) => {
  try {
    const userId = req.user._id;
    const { timeRange } = req.query;
    
    // Determine date range
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Default to last 30 days
    
    if (timeRange === 'week') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
    } else if (timeRange === 'month') {
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (timeRange === 'quarter') {
      startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 3);
    } else if (timeRange === 'custom' && req.query.startDate) {
      startDate = new Date(req.query.startDate);
    }
    
    // Get logs for the specified time range
    const logs = await Log.find({
      user: userId,
      date: { $gte: startDate }
    }).sort({ date: -1 });
    
    // Get active goals
    const goals = await Goal.find({
      user: userId,
      status: { $ne: 'completed' }
    });
    
    // Get completed tasks in the time range
    const tasks = await Task.find({
      user: userId,
      completedAt: { $gte: startDate }
    });
    
    // Generate insights using OpenAI
    const insights = await openaiService.generateInsights(logs, goals, userId);
    
    // Add summary data
    const summary = {
      logCount: logs.length,
      goalCount: goals.length,
      completedTaskCount: tasks.length,
      averageRating: logs.length > 0 
        ? logs.reduce((sum, log) => sum + (log.rating || 0), 0) / logs.length 
        : 0,
      topCategories: getTopCategories(logs),
      timeRange: {
        startDate,
        endDate: new Date()
      }
    };
    
    res.json({
      success: true,
      insights: {
        ...insights,
        summary
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating insights',
      error: error.message
    });
  }
};

/**
 * Get analytics data for dashboard
 */
exports.getAnalytics = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get goals summary
    const goals = await Goal.find({ user: userId });
    const goalsByStatus = {
      notStarted: goals.filter(g => g.status === 'not started').length,
      inProgress: goals.filter(g => g.status === 'in progress').length,
      completed: goals.filter(g => g.status === 'completed').length,
      abandoned: goals.filter(g => g.status === 'abandoned').length,
      total: goals.length
    };
    
    // Get tasks summary
    const tasks = await Task.find({ user: userId });
    const tasksByCompletion = {
      completed: tasks.filter(t => t.completed).length,
      pending: tasks.filter(t => !t.completed).length,
      total: tasks.length
    };
    
    // Get logs summary
    const logs = await Log.find({ user: userId });
    const logsByCategory = {};
    logs.forEach(log => {
      if (!logsByCategory[log.category]) {
        logsByCategory[log.category] = 0;
      }
      logsByCategory[log.category]++;
    });
    
    // Calculate average mood rating over time (by week)
    const moodOverTime = calculateMoodOverTime(logs);
    
    // Calculate productivity metrics
    const productivityMetrics = calculateProductivityMetrics(tasks);
    
    res.json({
      success: true,
      analytics: {
        goals: goalsByStatus,
        tasks: tasksByCompletion,
        logs: {
          totalCount: logs.length,
          byCategory: logsByCategory
        },
        moodOverTime,
        productivity: productivityMetrics
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics',
      error: error.message
    });
  }
};

/**
 * Helper function to get top categories from logs
 */
function getTopCategories(logs) {
  const categories = {};
  
  logs.forEach(log => {
    if (!categories[log.category]) {
      categories[log.category] = 0;
    }
    categories[log.category]++;
  });
  
  // Convert to array and sort
  return Object.entries(categories)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5
}

/**
 * Helper function to calculate mood ratings over time
 */
function calculateMoodOverTime(logs) {
  // Group logs by week
  const weeklyLogs = {};
  
  logs.forEach(log => {
    if (!log.rating) return;
    
    const date = new Date(log.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay()); // Start of week (Sunday)
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!weeklyLogs[weekKey]) {
      weeklyLogs[weekKey] = { sum: 0, count: 0 };
    }
    
    weeklyLogs[weekKey].sum += log.rating;
    weeklyLogs[weekKey].count++;
  });
  
  // Calculate averages and format for response
  return Object.entries(weeklyLogs)
    .map(([week, data]) => ({
      week,
      averageRating: data.sum / data.count
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Helper function to calculate productivity metrics
 */
function calculateProductivityMetrics(tasks) {
  // Calculate average completion time
  const tasksWithDurationData = tasks.filter(
    t => t.completed && t.completedAt && t.createdAt
  );
  
  let avgCompletionTimeHours = 0;
  if (tasksWithDurationData.length > 0) {
    const totalHours = tasksWithDurationData.reduce((sum, task) => {
      const durationMs = new Date(task.completedAt) - new Date(task.createdAt);
      return sum + (durationMs / (1000 * 60 * 60)); // Convert to hours
    }, 0);
    avgCompletionTimeHours = totalHours / tasksWithDurationData.length;
  }
  
  // Calculate completion rate by priority
  const completionByPriority = {
    high: { total: 0, completed: 0, rate: 0 },
    medium: { total: 0, completed: 0, rate: 0 },
    low: { total: 0, completed: 0, rate: 0 }
  };
  
  tasks.forEach(task => {
    const priority = task.priority || 'medium';
    completionByPriority[priority].total++;
    if (task.completed) {
      completionByPriority[priority].completed++;
    }
  });
  
  // Calculate rates
  for (const priority in completionByPriority) {
    const data = completionByPriority[priority];
    data.rate = data.total > 0 ? (data.completed / data.total) * 100 : 0;
  }
  
  return {
    avgCompletionTimeHours,
    completionByPriority
  };
}