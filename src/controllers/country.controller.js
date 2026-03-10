/**
 * Country Controller: CRUD for admin-managed countries.
 * Public GET /countries for users to fetch the list.
 */

import Country from '../models/Country.js';
import CountryTimezone from '../models/CountryTimezone.js';

/**
 * GET /countries
 * List all countries (for user CountryToggle and admin).
 */
export async function listCountries(req, res) {
  try {
    const countries = await Country.find().sort({ order: 1, name: 1 }).lean();
    const list = countries.map((c) => ({
      id: c._id.toString(),
      name: c.name,
      code: c.code,
      label: c.label ?? `${c.code} ${c.name}`,
      hasMultipleTimezones: Boolean(c.hasMultipleTimezones),
      standardTime: c.standardTime ?? null,
      countryCode: c.countryCode ?? null,
      timeShort: c.timeShort ?? null,
      currency: c.currency ?? null,
      order: c.order ?? 0,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /countries/:countryId/timezones
 * List city/timezone options for a country (when hasMultipleTimezones is true).
 */
export async function listCountryTimezones(req, res) {
  try {
    const { countryId } = req.params;
    const timezones = await CountryTimezone.find({ country: countryId })
      .sort({ order: 1, cityName: 1 })
      .lean();
    const list = timezones.map((t) => ({
      id: t._id.toString(),
      countryId: t.country.toString(),
      cityName: t.cityName,
      standardTime: t.standardTime,
      timeShort: t.timeShort,
      countryCode: t.countryCode ?? null,
      currency: t.currency ?? null,
      order: t.order ?? 0,
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/countries
 * Create a new country (admin only).
 */
export async function createCountry(req, res) {
  try {
    console.log(req.body);
    const { name, code, label, hasMultipleTimezones, standardTime, countryCode, timeShort, currency, order } =
      req.body;
    if (!name || !code) {
      return res.status(400).json({ error: 'name and code are required' });
    }
    const multiTz = Boolean(hasMultipleTimezones);
    if (!multiTz && (!standardTime || !countryCode || !timeShort || !currency)) {
      return res.status(400).json({
        error:
          'For single time zone country, standardTime, countryCode, timeShort, and currency are required',
      });
    }
    const country = await Country.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      label: (label || `${code.trim().toUpperCase()} ${name.trim()}`).trim(),
      hasMultipleTimezones: multiTz,
      standardTime: standardTime ? String(standardTime).trim() : null,
      countryCode: countryCode ? String(countryCode).trim() : null,
      timeShort: timeShort ? String(timeShort).trim() : null,
      currency: currency ? String(currency).trim() : null,
      order: order ?? 0,
    });
    res.status(201).json({
      id: country._id.toString(),
      name: country.name,
      code: country.code,
      label: country.label,
      hasMultipleTimezones: country.hasMultipleTimezones,
      standardTime: country.standardTime,
      countryCode: country.countryCode,
      timeShort: country.timeShort,
      currency: country.currency,
      order: country.order,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Country with this name already exists' });
    }
    res.status(400).json({ error: err.message });
  }
}

/**
 * PATCH /admin/countries/:id
 * Update a country (admin only).
 */
export async function updateCountry(req, res) {
  console.log(req.body);
  try {
    const country = await Country.findById(req.params.id);
    if (!country) return res.status(404).json({ error: 'Country not found' });

    const { name, code, label, hasMultipleTimezones, standardTime, countryCode, timeShort, currency, order } =
      req.body;
    if (name !== undefined) country.name = String(name).trim();
    if (code !== undefined) country.code = String(code).trim().toUpperCase();
    if (label !== undefined) country.label = String(label).trim();
    if (hasMultipleTimezones !== undefined) country.hasMultipleTimezones = Boolean(hasMultipleTimezones);
    if (standardTime !== undefined) country.standardTime = standardTime ? String(standardTime).trim() : null;
    if (countryCode !== undefined) country.countryCode = countryCode ? String(countryCode).trim() : null;
    if (timeShort !== undefined) country.timeShort = timeShort ? String(timeShort).trim() : null;
    if (currency !== undefined) country.currency = currency ? String(currency).trim() : null;
    if (order !== undefined) country.order = Number(order) || 0;

    if (!country.hasMultipleTimezones && (!country.standardTime || !country.countryCode || !country.timeShort || !country.currency)) {
      return res.status(400).json({
        error: 'Single time zone country must have standardTime, countryCode, timeShort, and currency',
      });
    }

    await country.save();
    res.json({
      id: country._id.toString(),
      name: country.name,
      code: country.code,
      label: country.label,
      hasMultipleTimezones: country.hasMultipleTimezones,
      standardTime: country.standardTime,
      countryCode: country.countryCode,
      timeShort: country.timeShort,
      currency: country.currency,
      order: country.order,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Country with this name  already exists' });
    }
    res.status(400).json({ error: err.message });
  }
}

/**
 * DELETE /admin/countries/:id
 * Delete a country (admin only). Also removes its timezone rows.
 */
export async function deleteCountry(req, res) {
  try {
    const id = req.params.id;
    const country = await Country.findByIdAndDelete(id);
    if (!country) return res.status(404).json({ error: 'Country not found' });
    await CountryTimezone.deleteMany({ country: id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** ========== Admin: Country timezones (for hasMultipleTimezones countries) ========== */

export async function createCountryTimezone(req, res) {
  try {
    const { countryId } = req.params;
    const { cityName, standardTime, timeShort, countryCode, currency, order } = req.body || {};
    if (!cityName || !standardTime || !timeShort) {
      return res.status(400).json({
        error: 'cityName, standardTime, and timeShort are required',
      });
    }
    const country = await Country.findById(countryId);
    if (!country) return res.status(404).json({ error: 'Country not found' });
    const tz = await CountryTimezone.create({
      country: countryId,
      cityName: String(cityName).trim(),
      standardTime: String(standardTime).trim(),
      timeShort: String(timeShort).trim(),
      countryCode: countryCode ? String(countryCode).trim() : (country.countryCode || null),
      currency: currency ? String(currency).trim() : (country.currency || null),
      order: order ?? 0,
    });
    res.status(201).json({
      id: tz._id.toString(),
      countryId: tz.country.toString(),
      cityName: tz.cityName,
      standardTime: tz.standardTime,
      timeShort: tz.timeShort,
      countryCode: tz.countryCode,
      currency: tz.currency,
      order: tz.order,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function updateCountryTimezone(req, res) {
  try {
    const { timezoneId } = req.params;
    const { cityName, standardTime, timeShort, countryCode, currency, order } = req.body || {};
    const tz = await CountryTimezone.findById(timezoneId);
    if (!tz) return res.status(404).json({ error: 'Timezone not found' });
    if (cityName !== undefined) tz.cityName = String(cityName).trim();
    if (standardTime !== undefined) tz.standardTime = String(standardTime).trim();
    if (timeShort !== undefined) tz.timeShort = String(timeShort).trim();
    if (countryCode !== undefined) tz.countryCode = countryCode ? String(countryCode).trim() : null;
    if (currency !== undefined) tz.currency = currency ? String(currency).trim() : null;
    if (order !== undefined) tz.order = Number(order) || 0;
    await tz.save();
    res.json({
      id: tz._id.toString(),
      countryId: tz.country.toString(),
      cityName: tz.cityName,
      standardTime: tz.standardTime,
      timeShort: tz.timeShort,
      countryCode: tz.countryCode,
      currency: tz.currency,
      order: tz.order,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function deleteCountryTimezone(req, res) {
  try {
    const tz = await CountryTimezone.findByIdAndDelete(req.params.timezoneId);
    if (!tz) return res.status(404).json({ error: 'Timezone not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
