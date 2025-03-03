const Goal = require('../models/Goal');
const Task = require('../models/Task');
const openaiService = require('../services/openaiService');
const pineconeService = require('../services/pineconeService');

/**
 * Get all goals for a user
 */
exports.getGoals = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Extract query parameters
    const { status, category, sort = 'createdAt' } = req.query;
    
    // Build query
    const query = { user: userId };
    
    // Add filters if provided
    if (status) query.status = status;
    if (category) query.category = category;
    
    // Sort direction
    const sortDir = sort.startsWith('-') ? -1 : 1;
    const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
    
    // Find goals for this user with filters
    const goals = await Goal.find(query)
      .sort({ [sortField]: sortDir })
      .populate('tasks', 'title completed dueDate priority');
    
    res.json({
      success: true,
      goals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching goals',
      error: error.message
    });
  }
};

/**
 * Get a single goal by ID
 */
exports.getGoal = async (req, res) => {
  try {
    const userId = req.user._id;
    const goalId = req.params.id;
    
    // Find the goal
    const goal = await Goal.findOne({
      _id: goalId,
      user: userId
    }).populate('tasks');
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }
    
    res.json({
      success: true,
      goal
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching goal',
      error: error.message
    });
  }
};

/**
 * Create a new goal
 */
exports.createGoal = async (req, res) => {
  try {
    const userId = req.user._id;
    const { title, description, category, priority, deadline } = req.body;
    
    // Create a new goal
    const goal = new Goal({
      user: userId,
      title,
      description,
      category,
      priority,
      deadline: deadline ? new Date(deadline) : undefined
    });
    
    // Save the goal
    await goal.save();
    
    // Store in Pinecone for memory
    await pineconeService.storeMemory({
      id: `goal-${goal._id}`,
      type: 'goal',
      text: `Goal: ${title} - ${description || ''}`,
      metadata: {
        goalId: goal._id,
        category,
        priority
      }
    }, userId);
    
    // Generate AI suggested tasks if requested
    if (req.body.generateTasks) {
      try {
        const suggestedTasks = await openaiService.suggestTasks(goal);
        
        // Create and link tasks
        const createdTasks = [];
        
        for (const taskData of suggestedTasks) {
          const task = new Task({
            user: userId,
            goal: goal._id,
            title: taskData.title,
            description: taskData.description,
            priority: taskData.priority,
            estimatedDuration: taskData.estimatedDuration,
            aiSuggested: true
          });
          
          await task.save();
          createdTasks.push(task);
          
          // Add task to goal
          goal.tasks.push(task._id);
        }
        
        // Save updated goal with tasks
        await goal.save();
        
        // Return the goal with tasks
        return res.status(201).json({
          success: true,
          message: 'Goal created with AI suggested tasks',
          goal: {
            ...goal.toObject(),
            tasks: createdTasks
          }
        });
      } catch (aiError) {
        console.error('Error generating AI tasks:', aiError);
        // Continue without AI tasks if there's an error
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Goal created successfully',
      goal
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating goal',
      error: error.message
    });
  }
};

/**
 * Update a goal
 */
exports.updateGoal = async (req, res) => {
  try {
    const userId = req.user._id;
    const goalId = req.params.id;
    const updates = req.body;
    
    // Find the goal
    const goal = await Goal.findOne({
      _id: goalId,
      user: userId
    });
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }
    
    // Update allowed fields
    const allowedUpdates = ['title', 'description', 'category', 'priority', 'deadline', 'status'];
    
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        goal[field] = updates[field];
      }
    });
    
    // Convert deadline string to Date if provided
    if (updates.deadline) {
      goal.deadline = new Date(updates.deadline);
    }
    
    // Update Pinecone memory
    await pineconeService.storeMemory({
      id: `goal-${goal._id}`,
      type: 'goal',
      text: `Goal: ${goal.title} - ${goal.description || ''}`,
      metadata: {
        goalId: goal._id,
        category: goal.category,
        priority: goal.priority,
        status: goal.status
      }
    }, userId);
    
    // Save the goal
    await goal.save();
    
    res.json({
      success: true,
      message: 'Goal updated successfully',
      goal
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating goal',
      error: error.message
    });
  }
};

/**
 * Delete a goal
 */
exports.deleteGoal = async (req, res) => {
  try {
    const userId = req.user._id;
    const goalId = req.params.id;
    
    // Find and delete the goal
    const goal = await Goal.findOneAndDelete({
      _id: goalId,
      user: userId
    });
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }
    
    // Delete associated tasks
    await Task.deleteMany({
      goal: goalId,
      user: userId
    });
    
    res.json({
      success: true,
      message: 'Goal and associated tasks deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting goal',
      error: error.message
    });
  }
};

/**
 * Get AI analysis for a goal
 */
exports.getGoalAnalysis = async (req, res) => {
  try {
    const userId = req.user._id;
    const goalId = req.params.id;
    
    // Find the goal with tasks
    const goal = await Goal.findOne({
      _id: goalId,
      user: userId
    }).populate('tasks');
    
    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Goal not found'
      });
    }
    
    // If analysis is recent (less than 1 day old), return the existing analysis
    if (
      goal.aiAnalysis && 
      goal.aiAnalysis.lastUpdated && 
      (new Date() - new Date(goal.aiAnalysis.lastUpdated)) < 24 * 60 * 60 * 1000
    ) {
      return res.json({
        success: true,
        analysis: goal.aiAnalysis,
        fresh: false
      });
    }
    
    // Otherwise generate a new analysis
    const prompt = `
Analyze this goal and its progress:

Goal: ${goal.title}
Description: ${goal.description || 'No description'}
Category: ${goal.category}
Priority: ${goal.priority}
Progress: ${goal.progress}%
Status: ${goal.status}
Tasks: ${goal.tasks.length > 0 ? goal.tasks.map(t => `- ${t.title} (${t.completed ? 'Completed' : 'Pending'})`).join('\n') : 'No tasks'}

Provide:
1. Three strengths in pursuing this goal
2. Three potential challenges or weaknesses
3. Three actionable suggestions to improve progress

Format as a JSON with keys: strengths, weaknesses, suggestions (each an array of strings)
`;

    // Use OpenAI to analyze the goal
    const completion = await openaiService.processChat([
      { role: 'user', content: prompt }
    ], userId);
    
    // Extract analysis
    let analysis;
    try {
      // Try parsing as JSON
      analysis = JSON.parse(completion.message.content);
    } catch (parseError) {
      // If not valid JSON, use regex to extract sections
      const strengthsMatch = completion.message.content.match(/strengths.*?[\[\{](.*?)[\]\}]/s);
      const weaknessesMatch = completion.message.content.match(/weaknesses.*?[\[\{](.*?)[\]\}]/s);
      const suggestionsMatch = completion.message.content.match(/suggestions.*?[\[\{](.*?)[\]\}]/s);
      
      analysis = {
        strengths: strengthsMatch ? strengthsMatch[1].split(/[,"']+/).filter(s => s.trim()) : [],
        weaknesses: weaknessesMatch ? weaknessesMatch[1].split(/[,"']+/).filter(s => s.trim()) : [],
        suggestions: suggestionsMatch ? suggestionsMatch[1].split(/[,"']+/).filter(s => s.trim()) : []
      };
    }
    
    // Update goal with analysis
    goal.aiAnalysis = {
      ...analysis,
      lastUpdated: new Date()
    };
    
    await goal.save();
    
    res.json({
      success: true,
      analysis: goal.aiAnalysis,
      fresh: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating goal analysis',
      error: error.message
    });
  }
};