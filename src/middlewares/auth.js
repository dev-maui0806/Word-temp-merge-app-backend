import { authService } from '../services/auth.service.js';
import User from '../models/User.js';

/**
 * Middleware: verify JWT and attach req.user.
 * Expects: Authorization: Bearer <token> or x-access-token header
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token =
      (authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7)
        : null) || req.headers['x-access-token'];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = authService.verifyAccessToken(token);
    const user = await User.findById(decoded.userId).select('-pinHash');

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    req.userId = user._id.toString();
    req.authMethod = decoded.authMethod || 'otp';
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
