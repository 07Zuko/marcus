const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

// Middleware to protect routes that require authentication
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No token provided - allow continue but with no user
      // This allows public/guest access to some endpoints
      console.log('No auth token provided - continuing as unauthenticated user');
      req.user = null;
      return next();
    }
    
    // Extract token from header
    const token = authHeader.split(' ')[1];
    
    console.log('Processing token for authentication');
    
    // For real tokens, verify with JWT
    try {
      // Verify token
      const decoded = jwt.verify(token, config.JWT_SECRET);
      
      // Find user with the ID from token
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        // User not found but continue as unauthenticated
        req.user = null;
        return next();
      }
      
      // Add user to request object
      req.user = user;
      next();
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError);
      
      // For any JWT error, continue as unauthenticated
      req.user = null;
      next();
    }
  } catch (error) {
    console.error('Authentication middleware error:', error);
    
    res.status(500).json({ 
      success: false, 
      message: 'Authentication error.', 
      error: error.message 
    });
  }
};

module.exports = { authenticate };