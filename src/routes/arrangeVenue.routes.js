import { Router } from 'express';
import * as templateController from '../controllers/template.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// DEPRECATED: Use unified /generate/:actionSlug endpoint instead
// Keeping this for backward compatibility, but it now uses the unified controller
router.post(
  '/generate-arrange-venue',
  requireAuth,
  (req, res, next) => {
    // Redirect to unified endpoint by setting actionSlug
    req.params.actionSlug = 'arrange-venue';
    templateController.generateDocument(req, res, next);
  }
);

export default router;
