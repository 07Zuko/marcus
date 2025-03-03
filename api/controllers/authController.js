const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');

// Register a new user
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists.'
      });
    }
    
    // Create new user
    const user = new User({
      name,
      email,
      password
    });
    
    // Save user to database
    await user.save();
    
    // Generate JWT token
    const token = jwt.sign(
      { id: user._id }, 
      config.JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message
    });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Login attempt for:', email);
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    // For demo/testing purposes, create a user if they don't exist
    if (!user) {
      console.log('Creating new user for:', email);
      user = new User({
        name: email.split('@')[0], // Use part of email as name
        email,
        password: 'dummy_password' // This would normally be hashed
      });
      
      try {
        await user.save();
        console.log('Created new user with ID:', user._id);
      } catch (saveError) {
        console.error('Error creating user:', saveError);
        // Continue with login even if save fails
      }
    }
    
    // Skip password verification for demo purposes
    console.log('Generating token for user ID:', user._id);
    
    // Generate JWT token with more data
    const token = jwt.sign(
      { 
        id: user._id,
        email: user.email,
        name: user.name || email.split('@')[0]
      }, 
      config.JWT_SECRET,
      { expiresIn: '100y' } // Long expiration for testing
    );
    
    console.log('Login successful, token generated');
    
    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name || email.split('@')[0],
        email: user.email,
        preferences: user.preferences || {}
      }
    });
  } catch (error) {
    console.error('Error in login process:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message
    });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    // User is already available from auth middleware
    const user = req.user;
    
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferences: user.preferences,
        integrations: user.integrations,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching user profile',
      error: error.message
    });
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, preferences } = req.body;
    const user = req.user;
    
    // Update fields
    if (name) user.name = name;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };
    
    await user.save();
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferences: user.preferences
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};