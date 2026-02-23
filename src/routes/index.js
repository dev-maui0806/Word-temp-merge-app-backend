import { Router } from 'express';
import arrangeVenueRoutes from './arrangeVenue.routes.js';
import authRoutes from './auth.routes.js';
import templateRoutes from './template.routes.js';
import documentRoutes from './document.routes.js';
import contactRoutes from './contact.routes.js';
import eventRoutes from './event.routes.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

router.use('/auth', authRoutes);
router.use('/', templateRoutes);
router.use('/', documentRoutes);
router.use('/', contactRoutes);
router.use('/', eventRoutes);
router.use('/', arrangeVenueRoutes);

export default router;
