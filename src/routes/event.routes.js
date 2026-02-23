import { Router } from 'express';
import * as eventController from '../controllers/event.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/events/dates', requireAuth, eventController.listEventDates);
router.get('/events', requireAuth, eventController.listEvents);
router.post('/events', requireAuth, eventController.createEvent);
router.patch('/events/:id', requireAuth, eventController.updateEvent);
router.delete('/events/:id', requireAuth, eventController.deleteEvent);

export default router;
