const Log = require('../models/Log');
const pineconeService = require('../services/pineconeService');

/**
 * Get all logs for a user
 */
exports.getLogs = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Extract query parameters
    const { 
      category, 
      sort = '-date',
      startDate,
      endDate,
      tag
    } = req.query;
    
    // Build query
    const query = { user: userId };
    
    // Add filters if provided
    if (category) query.category = category;
    if (tag) query.tags = tag;
    
    // Date range filter
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) query.date.$lte = new Date(endDate);
    }
    
    // Sort direction
    const sortDir = sort.startsWith('-') ? -1 : 1;
    const sortField = sort.startsWith('-') ? sort.substring(1) : sort;
    
    // Find logs for this user with filters
    const logs = await Log.find(query)
      .sort({ [sortField]: sortDir })
      .populate('relatedTo.goalId', 'title')
      .populate('relatedTo.taskId', 'title');
    
    res.json({
      success: true,
      logs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching logs',
      error: error.message
    });
  }
};

/**
 * Get a single log by ID
 */
exports.getLog = async (req, res) => {
  try {
    const userId = req.user._id;
    const logId = req.params.id;
    
    // Find the log
    const log = await Log.findOne({
      _id: logId,
      user: userId
    })
    .populate('relatedTo.goalId', 'title')
    .populate('relatedTo.taskId', 'title');
    
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }
    
    res.json({
      success: true,
      log
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching log',
      error: error.message
    });
  }
};

/**
 * Create a new log
 */
exports.createLog = async (req, res) => {
  try {
    const userId = req.user._id;
    const { 
      title, 
      description, 
      category, 
      date, 
      duration, 
      rating,
      tags,
      relatedTo
    } = req.body;
    
    // Create a new log
    const log = new Log({
      user: userId,
      title,
      description,
      category,
      date: date ? new Date(date) : new Date(),
      duration,
      rating,
      tags: tags || [],
      relatedTo
    });
    
    // Save the log
    await log.save();
    
    // Store in Pinecone for memory
    await pineconeService.storeMemory({
      id: `log-${log._id}`,
      type: 'log',
      text: `Log: ${title} - ${description || ''}`,
      metadata: {
        logId: log._id,
        category,
        date: log.date,
        rating,
        goalId: relatedTo?.goalId,
        taskId: relatedTo?.taskId
      }
    }, userId);
    
    res.status(201).json({
      success: true,
      message: 'Log created successfully',
      log
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating log',
      error: error.message
    });
  }
};

/**
 * Update a log
 */
exports.updateLog = async (req, res) => {
  try {
    const userId = req.user._id;
    const logId = req.params.id;
    const updates = req.body;
    
    // Find the log
    const log = await Log.findOne({
      _id: logId,
      user: userId
    });
    
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }
    
    // Update allowed fields
    const allowedUpdates = [
      'title', 'description', 'category', 'date', 'duration', 
      'rating', 'tags', 'relatedTo'
    ];
    
    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        log[field] = updates[field];
      }
    });
    
    // Convert date string to Date if provided
    if (updates.date) {
      log.date = new Date(updates.date);
    }
    
    // Update Pinecone memory
    await pineconeService.storeMemory({
      id: `log-${log._id}`,
      type: 'log',
      text: `Log: ${log.title} - ${log.description || ''}`,
      metadata: {
        logId: log._id,
        category: log.category,
        date: log.date,
        rating: log.rating,
        goalId: log.relatedTo?.goalId,
        taskId: log.relatedTo?.taskId
      }
    }, userId);
    
    // Save the log
    await log.save();
    
    res.json({
      success: true,
      message: 'Log updated successfully',
      log
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating log',
      error: error.message
    });
  }
};

/**
 * Delete a log
 */
exports.deleteLog = async (req, res) => {
  try {
    const userId = req.user._id;
    const logId = req.params.id;
    
    // Find and delete the log
    const log = await Log.findOneAndDelete({
      _id: logId,
      user: userId
    });
    
    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Log deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting log',
      error: error.message
    });
  }
};