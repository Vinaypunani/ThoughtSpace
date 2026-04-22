const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const config = require('../../config/env');
const redisClient = require('../../config/redis');
const ApiError = require('../../utils/ApiError');

const REFRESH_TOKEN_TTL = 604800; // 7 days in seconds

const authService = {
  /**
   * Generates a short-lived JWT access token
   */
  generateAccessToken: (userId, role) => {
    const payload = { sub: userId, role };
    const jti = crypto.randomUUID(); // Unique identifier for the token (for blacklisting)
    
    const token = jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpires,
      jwtid: jti
    });
    
    return { token, jti };
  },

  /**
   * Generates a random refresh token UUID and stores it in Redis
   */
  generateRefreshToken: async (userId) => {
    const tokenId = crypto.randomUUID();
    const key = `refresh:${userId}:${tokenId}`;
    
    await redisClient.set(key, "1", "EX", REFRESH_TOKEN_TTL);
    
    return tokenId;
  },

  /**
   * Verifies the access token and checks if it was blacklisted
   */
  verifyAccessToken: async (token) => {
    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      
      // Check if token was manually blacklisted (e.g., user logged out)
      const isBlacklisted = await redisClient.get(`blacklist:${decoded.jti}`);
      if (isBlacklisted) {
        throw ApiError.unauthorized('Token has been blacklisted');
      }
      
      return decoded;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.unauthorized('Invalid or expired token');
    }
  },

  /**
   * Invalidates old refresh token and generates a new one
   */
  rotateRefreshToken: async (userId, oldTokenId) => {
    const key = `refresh:${userId}:${oldTokenId}`;
    const exists = await redisClient.get(key);
    
    if (!exists) {
      throw ApiError.unauthorized('Refresh token expired or invalid');
    }
    
    // Invalidate the old token
    await redisClient.del(key);
    
    // Issue a new one
    const newTokenId = await authService.generateRefreshToken(userId);
    return newTokenId;
  },

  /**
   * Blacklists a token UUID until its natural expiration
   */
  blacklistAccessToken: async (jti, ttlSeconds) => {
    // Only blacklist if the token hasn't already expired naturally
    if (ttlSeconds > 0) {
      await redisClient.set(`blacklist:${jti}`, "1", "EX", Math.ceil(ttlSeconds));
    }
  },

  /**
   * Generates a 6-digit random string for email/SMS verification
   */
  generateOTP: () => {
    // crypto.randomInt ensures uniform distribution (unlike Math.random)
    return crypto.randomInt(100000, 999999).toString();
  },

  /**
   * Hashes an OTP before storing it
   */
  hashOTP: async (otp) => {
    return await bcrypt.hash(otp, 10);
  },

  /**
   * Verifies a plain text OTP against the stored hash
   */
  verifyOTP: async (plain, hash) => {
    return await bcrypt.compare(plain, hash);
  }
};

module.exports = authService;
