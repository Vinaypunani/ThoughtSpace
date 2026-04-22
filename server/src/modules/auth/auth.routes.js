const express = require('express');
const authController = require('./auth.controller');

// We will require the middleware once it's implemented. For now, we stub them.
// In a real scenario, these would come from:
// const { authenticate } = require('../../middlewares/authenticate');
// const { authRateLimiter } = require('../../middlewares/rateLimiter');
// const passport = require('passport');

// Mock middlewares to prevent crashing before they are fully implemented
const authenticate = (req, res, next) => next();
const authRateLimiter = (req, res, next) => next();
const passport = { authenticate: () => (req, res, next) => next() };

const router = express.Router();

router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
  // Handle successful OAuth login
  res.status(200).json({ status: 'success', message: 'OAuth placeholder' });
});

router.post('/forgot-password', authRateLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email', authController.verifyEmail);

module.exports = router;
