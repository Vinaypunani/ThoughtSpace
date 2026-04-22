const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;
const redisClient = require('../config/redis');

// Helper to create a Redis-backed rate limiter
const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    store: new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    }),
  });
};

// Global rate limiter: 200 requests per 15 minutes per IP
const globalRateLimiter = createRateLimiter(
  15 * 60 * 1000, 
  200, 
  'Too many requests from this IP, please try again after 15 minutes'
);

// Auth rate limiter: 10 requests per 15 minutes per IP
const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, 
  10, 
  'Too many authentication attempts, please try again after 15 minutes'
);

// Upload rate limiter: 30 requests per hour per IP
const uploadRateLimiter = createRateLimiter(
  60 * 60 * 1000, 
  30, 
  'Upload limit reached, please try again after an hour'
);

module.exports = {
  globalRateLimiter,
  authRateLimiter,
  uploadRateLimiter
};
