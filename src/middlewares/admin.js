import { requireAuth } from './auth.js';

const ADMIN_EMAIL = 'yasasrree02@gmail.com';

/**
 * Require admin access: authenticated user AND (email === admin email OR role === 'admin')
 */
export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    const user = req.user;
    const isAdmin =
      user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase() ||
      user?.role === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}
