const authService = require('../modules/auth/auth.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Authentication token is missing');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = await authService.verifyAccessToken(token);
    
    // Attach details to the request object
    req.user = {
      id: decoded.sub,
      role: decoded.role
    };
    req.jti = decoded.jti;
    req.exp = decoded.exp; // Extracted for logout blacklisting purposes
    
    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw ApiError.unauthorized('Invalid or expired authentication token');
  }
});

module.exports = authenticate;
