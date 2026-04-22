const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    sparse: true // Allows nulls/undefined for OAuth users without a username yet
  },
  email: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true,
    required: true
  },
  passwordHash: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['author', 'admin'],
    default: 'author'
  },
  profile: {
    displayName: { type: String, trim: true, maxlength: 100 },
    bio: { type: String, maxlength: 500 },
    avatarUrl: String,
    website: String,
    social: { 
      twitter: String, 
      linkedin: String, 
      github: String 
    }
  },
  oauth: [{ 
    provider: String, 
    providerId: String, 
    accessToken: String 
  }],
  isVerified: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  newsletterSub: {
    type: Boolean,
    default: false
  },
  lastLoginAt: Date
}, {
  timestamps: true
});

// Explicit indexing for optimal querying
// email and username are already uniquely indexed by the schema definitions above
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Methods
userSchema.methods.comparePassword = async function(plainText) {
  // If there's no password (e.g. OAuth-only users), return false
  if (!this.passwordHash) return false;
  return bcrypt.compare(plainText, this.passwordHash);
};

userSchema.methods.toPublicJSON = function() {
  const user = this.toObject();
  
  // Omit sensitive data
  delete user.passwordHash;
  delete user.oauth;
  delete user.__v;
  
  return user;
};

// Pre-save hook
userSchema.pre('save', async function(next) {
  // Only hash if passwordHash is being modified and it exists
  if (this.isModified('passwordHash') && this.passwordHash) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
