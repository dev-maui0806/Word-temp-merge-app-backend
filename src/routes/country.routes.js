import { Router } from 'express';
import * as countryController from '../controllers/country.controller.js';

const router = Router();

/** Public: list countries for user CountryToggle */
router.get('/countries', countryController.listCountries);

/** Public: list city/timezone options for a country (when hasMultipleTimezones) */
router.get('/countries/:countryId/timezones', countryController.listCountryTimezones);

/** Public: current time metadata for selected country / city */
router.get('/countries/current-time', countryController.getCountryCurrentTime);

export default router;
