const Joi = require('joi');
const jwt = require('jsonwebtoken');
const User = require('../users/user.model');
const authService = require('./auth.service');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const redisClient = require('../../config/redis');
const config = require('../../config/env');

// Mock emailQueue since we haven't built the jobs directory yet
const emailQueue = {
  add: async (jobName, data) => {
    console.log(`[Queue Mock] Added job '${jobName}' for`, data);
  }
};

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string()
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,}$'))
    .required()
    .messages({
      'string.pattern.base': 'Password must be at least 8 characters long and contain at least 1 uppercase letter and 1 number'
    })
});

const register = asyncHandler(async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const { email, username, password } = value;

  // Check duplicate email/username
  const existingUser = await User.findOne({ $or: [{ email }, { username }] });
  if (existingUser) {
    throw ApiError.conflict('Email or username is already in use');
  }

  // Create user (passwordHash auto-hashed in pre-save hook)
  const user = new User({
    email,
    username,
    passwordHash: password
  });

  await user.save();

  // Add job to emailQueue
  await emailQueue.add('verify', { userId: user._id, email: user.email });

  res.status(201).json({
    status: 'success',
    data: { user: user.toPublicJSON() }
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw ApiError.badRequest('Email and password are required');
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Account is deactivated');
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const { token: accessToken, jti } = authService.generateAccessToken(user._id, user.role);
  const refreshToken = await authService.generateRefreshToken(user._id);

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    data: {
      accessToken,
      refreshToken,
      user: user.toPublicJSON()
    }
  });
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    throw ApiError.badRequest('Refresh token is required');
  }

  // Read refreshToken from body, decode userId from it
  const userId = await redisClient.get(`refresh:${refreshToken}`);
  if (!userId) {
    throw ApiError.unauthorized('Refresh token expired or invalid');
  }

  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw ApiError.unauthorized('User is deactivated or deleted');
  }

  // Call rotateRefreshToken -> return new pair
  const newRefreshToken = await authService.rotateRefreshToken(userId, refreshToken);
  const { token: newAccessToken } = authService.generateAccessToken(user._id, user.role);

  res.status(200).json({
    status: 'success',
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  });
});

const logout = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  
  // Get jti from req.user/req.jwt (will be set by authenticate middleware)
  const jti = req.jti; // Assumes middleware decodes and attaches jti
  const exp = req.exp; // Assumes middleware attaches token expiration

  if (jti && exp) {
    const ttlSeconds = exp - Math.floor(Date.now() / 1000);
    await authService.blacklistAccessToken(jti, ttlSeconds);
  }

  if (refreshToken) {
    await redisClient.del(`refresh:${refreshToken}`);
  }

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully'
  });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw ApiError.badRequest('Email is required');

  const user = await User.findOne({ email });
  
  if (user) {
    const otp = authService.generateOTP();
    const hash = await authService.hashOTP(otp);
    
    // Store in Redis: otp:<userId> hash EX 900 (15 min)
    await redisClient.set(`otp:${user._id}`, hash, 'EX', 900);
    
    await emailQueue.add('reset', { email: user.email, otp });
  }

  // Don't reveal if user not found — always 200
  res.status(200).json({
    status: 'success',
    message: 'If that email exists, an OTP has been sent'
  });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    throw ApiError.badRequest('Email, OTP, and newPassword are required');
  }

  const user = await User.findOne({ email });
  if (!user) throw ApiError.badRequest('Invalid request');

  const hash = await redisClient.get(`otp:${user._id}`);
  if (!hash) throw ApiError.badRequest('OTP expired or invalid');

  const isValid = await authService.verifyOTP(otp, hash);
  if (!isValid) throw ApiError.badRequest('Invalid OTP');

  user.passwordHash = newPassword; // Auto-hashed in pre-save hook
  await user.save();

  await redisClient.del(`otp:${user._id}`);

  res.status(200).json({
    status: 'success',
    message: 'Password reset successfully'
  });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) throw ApiError.badRequest('Verification token is required');

  try {
    // Assuming the token sent via email is a JWT containing the userId in `sub`
    const decoded = jwt.verify(token, config.jwt.secret);
    const user = await User.findById(decoded.sub);
    
    if (!user) throw ApiError.badRequest('Invalid verification token');

    user.isVerified = true;
    await user.save({ validateBeforeSave: false });

    await emailQueue.add('welcome', { email: user.email, name: user.username });

    res.status(200).json({
      status: 'success',
      message: 'Email verified successfully'
    });
  } catch (err) {
    throw ApiError.badRequest('Verification token is invalid or expired');
  }
});

module.exports = {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  verifyEmail
};
