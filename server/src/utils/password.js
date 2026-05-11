/* Shared password validation. Returns nothing on success; throws an
   object shaped like { status, message } so route handlers can let
   their existing try/catch convert it to a 4xx response. We enforce
   a min of 8 and a max of 128 — the upper bound matters because
   bcrypt silently truncates inputs longer than 72 bytes, and we'd
   rather reject than store a password the user can't actually log in
   with later. */

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 8 || password.length > 128) {
    const err = new Error("Password must be 8-128 characters.");
    err.status = 400;
    throw err;
  }
}

module.exports = {
  validatePassword
};
