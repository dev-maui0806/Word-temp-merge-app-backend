import { Router } from 'express';
import * as supportController from '../controllers/support.controller.js';

const router = Router();

// Public endpoint for Contact Us form submission (no auth required).
router.post('/support/contact', supportController.submitSupportMessage);

export default router;

