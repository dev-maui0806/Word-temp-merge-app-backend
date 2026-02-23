import { Router } from 'express';
import { requireAdmin } from '../middlewares/admin.js';
import * as adminController from '../controllers/admin.controller.js';
import * as countryController from '../controllers/country.controller.js';

const router = Router();

// All routes in this router are mounted under /admin in index.js
// and are protected by the admin middleware.
router.use(requireAdmin);

/** Templates */
router.get('/templates', adminController.listTemplates);
router.get('/templates/:actionSlug/file', adminController.getTemplateFile);
router.post('/templates/:actionSlug/save', adminController.saveTemplateFromHtml);
router.post(
  '/templates/:actionSlug/upload',
  (req, res, next) => {
    adminController.uploadTemplate(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  adminController.uploadTemplateFile
);
router.delete('/templates/:actionSlug', adminController.deleteTemplate);

/** Countries */
router.post('/countries', countryController.createCountry);
router.patch('/countries/:id', countryController.updateCountry);
router.delete('/countries/:id', countryController.deleteCountry);

/** Users & documents (admin only) */
router.get('/users', adminController.listUsers);
router.get('/users/:userId/documents', adminController.listUserDocuments);
router.get('/users/:userId/documents/:id', adminController.getUserDocument);
router.get('/users/:userId/documents/:id/file', adminController.getUserDocumentFile);

export default router;
