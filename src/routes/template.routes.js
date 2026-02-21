import { Router } from 'express';
import * as templateController from '../controllers/template.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

router.get('/templates/:actionSlug/metadata', templateController.getTemplateMetadataHandler);
router.post('/generate/:actionSlug', requireAuth, templateController.generateDocument);

export default router;
