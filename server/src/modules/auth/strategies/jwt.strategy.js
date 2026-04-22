const passport = require('passport');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const config = require('../../../config/env');
const User = require('../../users/user.model');

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: config.jwt.secret
};

const jwtStrategy = new JwtStrategy(options, async (payload, done) => {
  try {
    const user = await User.findById(payload.sub);
    
    if (!user) {
      return done(null, false);
    }
    
    if (!user.isActive) {
      return done(null, false);
    }

    // Attach full user to req.user for further use in downstream controllers/middlewares
    return done(null, user);
  } catch (err) {
    return done(err, false);
  }
});

passport.use(jwtStrategy);

module.exports = jwtStrategy;
