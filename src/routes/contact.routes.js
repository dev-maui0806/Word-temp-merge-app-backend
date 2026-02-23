import { Router } from 'express';
import * as contactController from '../controllers/contact.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/contacts', requireAuth, contactController.listContacts);
router.post('/contacts', requireAuth, contactController.createContact);

export default router;
