const ApiError = require('../utils/ApiError');

const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { 
      abortEarly: false, // Return all validation errors, not just the first one
      stripUnknown: true // Remove unknown keys from the validated object
    });

    if (error) {
      // Map Joi error details into a cleaner array of strings/objects
      const details = error.details.map((err) => ({
        field: err.path.join('.'),
        message: err.message
      }));
      
      return next(ApiError.badRequest('Validation Error', details));
    }

    // Replace req.body with the sanitized/validated value
    req.body = value;
    next();
  };
};

module.exports = validate;
