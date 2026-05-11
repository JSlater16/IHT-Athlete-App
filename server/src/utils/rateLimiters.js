const rateLimit = require("express-rate-limit");

/* Centralized rate limiters. Login is per-IP (smart attackers
   rotate emails, and keying by email leaks which addresses exist).
   Password-change/reset limiters are deliberately tight: a user
   should never legitimately make more than a handful of attempts
   in a 15-minute window, and an attacker shouldn't either. */

const isProduction = process.env.NODE_ENV === "production";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 8 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many sign-in attempts. Wait a few minutes and try again."
  },
  skipSuccessfulRequests: true
});

const passwordChangeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many password attempts, try again later" },
  standardHeaders: true,
  legacyHeaders: false
});

/* AI report generation calls the Anthropic API and bills per call.
   30 generations/hour per IP comfortably supports a coach reviewing
   the whole roster but caps runaway burn from button-mashing. */
const aiReportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { error: "Too many report generations this hour. Try again later." },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  loginLimiter,
  passwordChangeLimiter,
  aiReportLimiter
};
