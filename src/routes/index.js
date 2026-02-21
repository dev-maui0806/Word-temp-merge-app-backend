import { Router } from 'express';
import arrangeVenueRoutes from './arrangeVenue.routes.js';
import authRoutes from './auth.routes.js';
import templateRoutes from './template.routes.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

router.use('/auth', authRoutes);
router.use('/', templateRoutes);
router.use('/', arrangeVenueRoutes);

export default router;
