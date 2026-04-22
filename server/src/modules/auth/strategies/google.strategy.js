const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const config = require('../../../config/env');
const User = require('../../users/user.model');
const authService = require('../auth.service');

const googleStrategy = new GoogleStrategy({
    clientID: config.googleClientId || 'PLACEHOLDER_CLIENT_ID', // Ensure this is in env.js later
    clientSecret: config.googleClientSecret || 'PLACEHOLDER_SECRET', // Ensure this is in env.js later
    callbackURL: `${config.clientUrl || 'http://localhost:3000'}/api/v1/auth/google/callback`,
    scope: ['profile', 'email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails[0].value;
      
      // Upsert user by email
      let user = await User.findOne({ email });

      if (user) {
        // If user exists, check if OAuth entry needs updating
        const oauthExists = user.oauth.some(o => o.provider === 'google' && o.providerId === profile.id);
        if (!oauthExists) {
          user.oauth.push({
            provider: 'google',
            providerId: profile.id,
            accessToken // Store Google's access token if needed for external API calls later
          });
          await user.save();
        }
      } else {
        // Create new user
        user = await User.create({
          email,
          // Generate a base username, potentially appending a random string to guarantee uniqueness
          username: `user_${profile.id}`, 
          isVerified: true, // Google emails are already verified
          profile: {
            displayName: profile.displayName,
            avatarUrl: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : null
          },
          oauth: [{
            provider: 'google',
            providerId: profile.id,
            accessToken
          }]
        });
      }

      // Issue JWT pair for our own system
      const { token: appAccessToken } = authService.generateAccessToken(user._id, user.role);
      const appRefreshToken = await authService.generateRefreshToken(user._id);

      // Pass tokens and user to the callback route via req.user
      return done(null, {
        accessToken: appAccessToken,
        refreshToken: appRefreshToken,
        user
      });
    } catch (err) {
      return done(err, false);
    }
  }
);

passport.use(googleStrategy);

module.exports = googleStrategy;
