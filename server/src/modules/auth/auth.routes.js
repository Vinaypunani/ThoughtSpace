const express = require('express');
const authController = require('./auth.controller');

const authenticate = require('../../middlewares/authenticate');
const { authRateLimiter } = require('../../middlewares/rateLimiter');
const passport = require('passport');
const config = require('../../config/env');

const router = express.Router();

router.post('/register', authRateLimiter, authController.register);
router.post('/login', authRateLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login' }), (req, res) => {
  // Extract tokens passed from the strategy
  const { accessToken, refreshToken } = req.user;
  
  // Redirect to CLIENT_URL with tokens as query params
  const redirectUrl = new URL(`${config.clientUrl}/oauth/callback`);
  redirectUrl.searchParams.append('accessToken', accessToken);
  redirectUrl.searchParams.append('refreshToken', refreshToken);
  
  res.redirect(redirectUrl.toString());
});

router.post('/forgot-password', authRateLimiter, authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-email', authController.verifyEmail);

module.exports = router;
