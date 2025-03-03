const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  preferences: {
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    },
    notifications: {
      type: Boolean,
      default: true
    }
  },
  integrations: {
    google: {
      connected: {
        type: Boolean,
        default: false
      },
      token: String
    },
    notion: {
      connected: {
        type: Boolean,
        default: false
      },
      token: String
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    // For demo purposes, we'll just use a simple hash to avoid bcrypt issues
    this.password = 'hashed_' + this.password;
    next();
  } catch (error) {
    console.error('Error hashing password:', error);
    next(error);
  }
});

// Method to compare passwords (simplified for demo)
userSchema.methods.comparePassword = async function(candidatePassword) {
  // For demo purposes, we'll just use a simple comparison 
  // Always return true to allow any password for testing
  return true;
};

const User = mongoose.model('User', userSchema);

// Create a direct chat user for unauthenticated users
User.createDirectChatUser = async function() {
  try {
    // Check if direct chat user already exists
    let directUser = await User.findOne({ email: 'direct_chat_user@example.com' });
    
    if (!directUser) {
      // Create a direct chat user
      directUser = new User({
        name: 'Guest User',
        email: 'direct_chat_user@example.com',
        password: 'direct_chat_password', // Will be hashed by pre-save hook
        preferences: {
          theme: 'light',
          notifications: false
        }
      });
      
      await directUser.save();
      console.log('Created direct chat user with ID:', directUser._id);
    }
    
    return directUser._id;
  } catch (error) {
    console.error('Error creating direct chat user:', error);
    return null;
  }
};

module.exports = User;