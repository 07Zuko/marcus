const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');

// Middleware to protect routes that require authentication
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Access denied. No token provided.' 
      });
    }
    
    // Extract token from header
    const token = authHeader.split(' ')[1];
    
    // All tokens will be treated as real JWT tokens - no demo mode
    console.log('Processing token for authentication');
    
    // For real tokens, verify with JWT
    try {
      // Verify token
      const decoded = jwt.verify(token, config.JWT_SECRET);
      
      // Find user with the ID from token
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found.' 
        });
      }
      
      // Add user to request object
      req.user = user;
      next();
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError);
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false, 
          message: 'Invalid token.' 
        });
      } else if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false, 
          message: 'Token expired.' 
        });
      }
      
      // Do not fall back to demo mode - return authentication error
      return res.status(401).json({
        success: false, 
        message: 'Authentication failed - invalid token.' 
      });
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