import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { enforcePinRestrictions } from '../middlewares/enforcePinRestrictions.js';
import * as phonepeController from '../controllers/phonepe.controller.js';

const router = Router();

router.get('/plans', phonepeController.listPlans);

router.post('/phonepe/checkout', requireAuth, enforcePinRestrictions, phonepeController.createCheckout);

// Poll status (uses PhonePe Order Status API server-side)
router.get('/phonepe/order/:merchantOrderId/status', requireAuth, phonepeController.getOrderStatus);

// MOCK settle for testing during KYC (requires PHONEPE_MODE=MOCK)
router.post('/phonepe/mock/settle', requireAuth, phonepeController.mockSettle);

// Callback is called by PhonePe servers (no auth)
router.post('/phonepe/callback', phonepeController.handleCallback);

export default router;

