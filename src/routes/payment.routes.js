import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { enforcePinRestrictions } from '../middlewares/enforcePinRestrictions.js';
import * as razorpayController from '../controllers/razorpay.controller.js';

const router = Router();

router.get('/plans', razorpayController.listPlans);

router.post('/razorpay/order', requireAuth, enforcePinRestrictions, razorpayController.createOrder);

router.post('/razorpay/verify', requireAuth, razorpayController.verifyPayment);

router.get('/razorpay/order/:orderId/status', requireAuth, razorpayController.getOrderStatus);

export default router;

