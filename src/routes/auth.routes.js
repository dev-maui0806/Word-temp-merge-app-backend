import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { enforcePinRestrictions } from '../middlewares/enforcePinRestrictions.js';

const router = Router();

router.get('/me', requireAuth, authController.me);
router.put('/me', requireAuth, authController.updateProfile);

// PIN setup & login
router.post('/pin/setup', requireAuth, enforcePinRestrictions, authController.setupPin);
router.post('/pin/login', authController.loginWithPin);

// OTP / Google flows
router.post('/otp/email/send', authController.sendEmailOtp);
router.post('/otp/email/verify', authController.verifyEmailOtp);
router.post('/otp/mobile/send', authController.sendMobileOtp);
router.post('/otp/mobile/verify', authController.verifyMobileOtp);
router.post('/google', authController.googleAuth);
router.post('/refresh', authController.refreshToken);

export default router;
