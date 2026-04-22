const redisClient = require('../config/redis');
const logger = require('./logger');

const cache = {
  get: async (key) => {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Redis GET error for key ${key}: ${error.message}`);
      return null; // Fallback gracefully if cache fails
    }
  },

  set: async (key, value, ttlSeconds) => {
    try {
      const stringifiedValue = JSON.stringify(value);
      if (ttlSeconds) {
        await redisClient.set(key, stringifiedValue, 'EX', ttlSeconds);
      } else {
        await redisClient.set(key, stringifiedValue);
      }
    } catch (error) {
      logger.error(`Redis SET error for key ${key}: ${error.message}`);
    }
  },

  del: async (key) => {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error(`Redis DEL error for key ${key}: ${error.message}`);
    }
  },

  delPattern: async (pattern) => {
    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redisClient.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          const pipeline = redisClient.pipeline();
          keys.forEach((key) => pipeline.del(key));
          await pipeline.exec();
        }
      } while (cursor !== '0');
    } catch (error) {
      logger.error(`Redis DEL PATTERN error for pattern ${pattern}: ${error.message}`);
    }
  },

  incr: async (key) => {
    try {
      return await redisClient.incr(key);
    } catch (error) {
      logger.error(`Redis INCR error for key ${key}: ${error.message}`);
      return null;
    }
  },

  hincrby: async (hash, field, amount) => {
    try {
      return await redisClient.hincrby(hash, field, amount);
    } catch (error) {
      logger.error(`Redis HINCRBY error for hash ${hash}, field ${field}: ${error.message}`);
      return null;
    }
  },

  sadd: async (key, member, ttlSeconds) => {
    try {
      const pipeline = redisClient.pipeline();
      pipeline.sadd(key, member);
      if (ttlSeconds) {
        pipeline.expire(key, ttlSeconds);
      }
      await pipeline.exec();
    } catch (error) {
      logger.error(`Redis SADD error for key ${key}: ${error.message}`);
    }
  }
};

module.exports = cache;
