const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis').default;

const config = require('./config/env');
const logger = require('./utils/logger');
const redisClient = require('./config/redis');
const authRoutes = require('./modules/auth/auth.routes');

const app = express();

// 1. Global Middlewares
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Morgan logger stream
const stream = {
  write: (message) => logger.info(message.trim()),
};
app.use(morgan('combined', { stream }));

// Global Rate Limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
});
app.use(limiter);

// 2. Mount route placeholders
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok Hey', timestamp: new Date() });
});

const v1Router = express.Router();
v1Router.use('/auth', authRoutes);
v1Router.use('/users', (req, res) => res.status(501).send('Users Route Placeholder'));
v1Router.use('/posts', (req, res) => res.status(501).send('Posts Route Placeholder'));
v1Router.use('/comments', (req, res) => res.status(501).send('Comments Route Placeholder'));
v1Router.use('/tags', (req, res) => res.status(501).send('Tags Route Placeholder'));
v1Router.use('/media', (req, res) => res.status(501).send('Media Route Placeholder'));
v1Router.use('/search', (req, res) => res.status(501).send('Search Route Placeholder'));
v1Router.use('/analytics', (req, res) => res.status(501).send('Analytics Route Placeholder'));
v1Router.use('/newsletter', (req, res) => res.status(501).send('Newsletter Route Placeholder'));
v1Router.use('/admin', (req, res) => res.status(501).send('Admin Route Placeholder'));

app.use('/api/v1', v1Router);

// 4. 404 handler for unmatched routes
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: `Not Found - ${req.originalUrl}`,
  });
});

// 3. Global error handler (must be last)
app.use((err, req, res, next) => {
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: 'error',
      code: err.code,
      message: err.message,
      ...(err.details && { details: err.details }),
    });
  }

  // Log unknown errors
  logger.error('Unhandled Error: ', err);

  res.status(500).json({
    status: 'error',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Something went wrong!',
  });
});

module.exports = app;
