/**
 * Contact Controller: CRUD for user's contact directory (address book).
 */

import Contact, { CATEGORIES } from '../models/Contact.js';

/**
 * GET /contacts
 * List contacts for the current user. Optional query: category, search.
 */
export async function listContacts(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { category, search } = req.query;

    const filter = { userId };

    if (category && category !== 'ALL' && CATEGORIES.includes(category)) {
      filter.category = category;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const term = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: term, $options: 'i' } },
        { number: { $regex: term, $options: 'i' } },
        { mail: { $regex: term, $options: 'i' } },
        { city: { $regex: term, $options: 'i' } },
      ];
    }

    const contacts = await Contact.find(filter).sort({ name: 1 }).lean();

    const list = contacts.map((c) => ({
      id: c._id,
      name: c.name,
      number: c.number,
      mail: c.mail,
      city: c.city,
      category: c.category,
    }));

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /contacts
 * Create a new contact.
 */
export async function createContact(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { name, number, mail, city, category } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const cat = category && CATEGORIES.includes(category) ? category : 'CUSTOM';

    const contact = await Contact.create({
      userId,
      name: name.trim(),
      number: number ? String(number).trim() : '',
      mail: mail ? String(mail).trim() : '',
      city: city ? String(city).trim() : '',
      category: cat,
    });

    res.status(201).json({
      id: contact._id,
      name: contact.name,
      number: contact.number,
      mail: contact.mail,
      city: contact.city,
      category: contact.category,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
