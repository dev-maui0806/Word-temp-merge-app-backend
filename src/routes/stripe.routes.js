import { Router } from 'express';
import * as stripeController from '../controllers/stripe.controller.js';
import { stripeWebhookParser } from '../middlewares/stripeWebhook.js';
import { enforcePinRestrictions } from '../middlewares/enforcePinRestrictions.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.post(
  '/checkout',
  requireAuth,
  enforcePinRestrictions,
  stripeController.createCheckout
);

export function getWebhookRoute(express) {
  return [
    express.raw({ type: 'application/json' }),
    stripeWebhookParser,
    stripeController.handleWebhook,
  ];
}

export default router;
