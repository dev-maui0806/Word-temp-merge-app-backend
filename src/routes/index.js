import { Router } from 'express';
import arrangeVenueRoutes from './arrangeVenue.routes.js';
import authRoutes from './auth.routes.js';
import templateRoutes from './template.routes.js';
import documentRoutes from './document.routes.js';
import contactRoutes from './contact.routes.js';
import eventRoutes from './event.routes.js';
import countryRoutes from './country.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running' });
});

router.use('/auth', authRoutes);
router.use('/', countryRoutes);
router.use('/', templateRoutes);
router.use('/', documentRoutes);
router.use('/', contactRoutes);
router.use('/', eventRoutes);
router.use('/', arrangeVenueRoutes);
router.use('/admin', adminRoutes);

export default router;
