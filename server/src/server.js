const app = require('./app');
const config = require('./config/env');
const connectDB = require('./config/db');
const redisClient = require('./config/redis');
const logger = require('./utils/logger');

let server;

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Redis is already configured to connect upon require in redis.js, 
    // but we can log that we are initiating the application sequence
    logger.info('Initializing application services...');

    server = app.listen(config.port, () => {
      logger.info(`Server is running in ${config.nodeEnv} mode on port ${config.port}`);
    });
  } catch (error) {
    logger.error(`Error starting server: ${error.message}`);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown handler
const gracefulShutdown = () => {
  logger.info('SIGTERM/SIGINT signal received: closing HTTP server');
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      
      try {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
        
        await redisClient.quit();
        logger.info('Redis connection closed');
      } catch (err) {
        logger.error('Error during graceful shutdown:', err);
      } finally {
        process.exit(0);
      }
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
