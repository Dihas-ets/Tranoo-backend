const rateLimit = require('express-rate-limit');

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 'RATE_LIMITED',
    message: 'Trop de tentatives. Réessayez dans quelques minutes.',
  },
  skip: () => process.env.AUTH_RATE_LIMIT_ENABLED === 'false',
});

module.exports = authRateLimit;
