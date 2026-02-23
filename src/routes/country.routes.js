import { Router } from 'express';
import * as countryController from '../controllers/country.controller.js';

const router = Router();

/** Public: list countries for user CountryToggle */
router.get('/countries', countryController.listCountries);

export default router;
