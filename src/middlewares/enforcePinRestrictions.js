/**
 * Middleware: blocks requests authenticated via PIN.
 * Use on routes that require full password (not PIN):
 * - New device login
 * - Subscription payment
 * - Change email
 * - Change PIN
 *
 * Expects req.authMethod to be set by auth middleware:
 * - 'pin' → 403
 * - 'password' | 'google' | etc. → next()
 */
export function enforcePinRestrictions(req, res, next) {
  if (req.authMethod === 'pin') {
    return res.status(403).json({
      error: 'PIN cannot be used for this action',
      code: 'PIN_NOT_ALLOWED',
      message:
        'This action requires full password authentication. PIN is not permitted for: new device login, subscription payment, change email, or change PIN.',
    });
  }
  next();
}
