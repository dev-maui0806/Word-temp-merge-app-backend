import { Router } from 'express';
import * as documentController from '../controllers/document.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/documents', requireAuth, documentController.listDocuments);
router.get('/documents/:id/file', requireAuth, documentController.getDocumentFile);
router.get('/documents/:id', requireAuth, documentController.getDocument);

export default router;
