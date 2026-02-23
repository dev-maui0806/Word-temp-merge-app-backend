import { Router } from 'express';
import { requireAdmin } from '../middlewares/admin.js';
import * as adminController from '../controllers/admin.controller.js';
import * as countryController from '../controllers/country.controller.js';

const router = Router();

router.use(requireAdmin);

/** Templates */
router.get('/admin/templates', adminController.listTemplates);
router.get('/admin/templates/:actionSlug/file', adminController.getTemplateFile);
router.post('/admin/templates/:actionSlug/save', adminController.saveTemplateFromHtml);
router.post(
  '/admin/templates/:actionSlug/upload',
  (req, res, next) => {
    adminController.uploadTemplate(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
      next();
    });
  },
  adminController.uploadTemplateFile
);
router.delete('/admin/templates/:actionSlug', adminController.deleteTemplate);

/** Countries */
router.post('/admin/countries', countryController.createCountry);
router.patch('/admin/countries/:id', countryController.updateCountry);
router.delete('/admin/countries/:id', countryController.deleteCountry);

/** Users & documents (admin only) */
router.get('/admin/users', adminController.listUsers);
router.get('/admin/users/:userId/documents', adminController.listUserDocuments);
router.get('/admin/users/:userId/documents/:id', adminController.getUserDocument);
router.get('/admin/users/:userId/documents/:id/file', adminController.getUserDocumentFile);

export default router;
