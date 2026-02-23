/**
 * Country Controller: CRUD for admin-managed countries.
 * Public GET /countries for users to fetch the list.
 */

import Country from '../models/Country.js';

/**
 * GET /countries
 * List all countries (for user CountryToggle and admin).
 */
export async function listCountries(req, res) {
  try {
    const countries = await Country.find().sort({ order: 1, name: 1 }).lean();
    const list = countries.map((c) => ({
      id: c._id,
      name: c.name,
      code: c.code,
      label: c.label,
      standardTime: c.standardTime,
      countryCode: c.countryCode,
      timeShort: c.timeShort,
      currency: c.currency,
      order: c.order,
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
    const { name, code, label, standardTime, countryCode, timeShort, currency, order } = req.body;
    if (!name || !code || !label || !standardTime || !countryCode || !timeShort || !currency) {
      return res.status(400).json({
        error: 'name, code, label, standardTime, countryCode, timeShort, currency are required',
      });
    }
    const country = await Country.create({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      label: label.trim(),
      standardTime: standardTime.trim(),
      countryCode: countryCode.trim(),
      timeShort: timeShort.trim(),
      currency: currency.trim(),
      order: order ?? 0,
    });
    res.status(201).json({
      id: country._id,
      name: country.name,
      code: country.code,
      label: country.label,
      standardTime: country.standardTime,
      countryCode: country.countryCode,
      timeShort: country.timeShort,
      currency: country.currency,
      order: country.order,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Country with this name or code already exists' });
    }
    res.status(400).json({ error: err.message });
  }
}

/**
 * PATCH /admin/countries/:id
 * Update a country (admin only).
 */
export async function updateCountry(req, res) {
  try {
    const country = await Country.findById(req.params.id);
    if (!country) return res.status(404).json({ error: 'Country not found' });

    const { name, code, label, standardTime, countryCode, timeShort, currency, order } = req.body;
    if (name !== undefined) country.name = String(name).trim();
    if (code !== undefined) country.code = String(code).trim().toUpperCase();
    if (label !== undefined) country.label = String(label).trim();
    if (standardTime !== undefined) country.standardTime = String(standardTime).trim();
    if (countryCode !== undefined) country.countryCode = String(countryCode).trim();
    if (timeShort !== undefined) country.timeShort = String(timeShort).trim();
    if (currency !== undefined) country.currency = String(currency).trim();
    if (order !== undefined) country.order = Number(order) || 0;

    await country.save();
    res.json({
      id: country._id,
      name: country.name,
      code: country.code,
      label: country.label,
      standardTime: country.standardTime,
      countryCode: country.countryCode,
      timeShort: country.timeShort,
      currency: country.currency,
      order: country.order,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Country with this name or code already exists' });
    }
    res.status(400).json({ error: err.message });
  }
}

/**
 * DELETE /admin/countries/:id
 * Delete a country (admin only).
 */
export async function deleteCountry(req, res) {
  try {
    const country = await Country.findByIdAndDelete(req.params.id);
    if (!country) return res.status(404).json({ error: 'Country not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
