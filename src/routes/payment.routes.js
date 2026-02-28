import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { enforcePinRestrictions } from '../middlewares/enforcePinRestrictions.js';
import * as phonepeController from '../controllers/phonepe.controller.js';

const router = Router();

router.post('/phonepe/checkout', requireAuth, enforcePinRestrictions, phonepeController.createCheckout);

// Callback is called by PhonePe servers (no auth)
router.post('/phonepe/callback', phonepeController.handleCallback);

export default router;

