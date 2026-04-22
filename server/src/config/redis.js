const Redis = require('ioredis');
const config = require('./env');

const redisClient = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  // Ensure we don't block forever if connection fails initially
  maxRetriesPerRequest: null,
});

redisClient.on('ready', () => {
  console.log('Redis connected');
});

redisClient.on('error', (error) => {
  console.error('Redis connection error:', error.message);
});

module.exports = redisClient;
