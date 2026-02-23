/**
 * Event Controller: CRUD for user's calendar events.
 */

import Event, { STATUSES } from '../models/Event.js';
import dayjs from 'dayjs';

/**
 * GET /events
 * List future events for the current user. Optional query: from, to.
 */
export async function listEvents(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const from = req.query.from ? dayjs(req.query.from).startOf('day').toDate() : dayjs().startOf('day').toDate();
    const to = req.query.to ? dayjs(req.query.to).endOf('day').toDate() : dayjs().add(1, 'year').endOf('day').toDate();

    const events = await Event.find({
      userId,
      date: { $gte: from, $lte: to },
    })
      .sort({ date: 1 })
      .lean();

    const list = events.map((e) => ({
      id: e._id,
      date: e.date,
      caseDetails: e.caseDetails || '',
      venue: e.venue || '',
      caseManager: e.caseManager || '',
      status: e.status,
      issue: e.issue || '',
    }));

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /events/dates
 * List dates that have events (for calendar marking). Returns array of date strings YYYY-MM-DD.
 */
export async function listEventDates(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const from = req.query.from ? dayjs(req.query.from).startOf('month') : dayjs().startOf('month');
    const to = req.query.to ? dayjs(req.query.to).endOf('month') : from.clone().add(2, 'month').endOf('month');

    const events = await Event.find({
      userId,
      date: { $gte: from.toDate(), $lte: to.toDate() },
    })
      .select('date')
      .lean();

    const dates = [...new Set(events.map((e) => dayjs(e.date).format('YYYY-MM-DD')))];
    res.json(dates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /events
 * Create a new event.
 */
export async function createEvent(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { date, caseDetails, venue, caseManager, status, issue } = req.body;

    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const eventDate = dayjs(date).startOf('day').toDate();
    if (dayjs(eventDate).isBefore(dayjs().startOf('day'))) {
      return res.status(400).json({ error: 'Event date must be today or in the future' });
    }

    const st = status && STATUSES.includes(status) ? status : 'NOT_COMPLETED';

    const event = await Event.create({
      userId,
      date: eventDate,
      caseDetails: caseDetails ? String(caseDetails).trim() : '',
      venue: venue ? String(venue).trim() : '',
      caseManager: caseManager ? String(caseManager).trim() : '',
      status: st,
      issue: issue ? String(issue).trim() : '',
    });

    res.status(201).json({
      id: event._id,
      date: event.date,
      caseDetails: event.caseDetails,
      venue: event.venue,
      caseManager: event.caseManager,
      status: event.status,
      issue: event.issue,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * PATCH /events/:id
 * Update an event (e.g. status, caseDetails, venue, caseManager, issue).
 */
export async function updateEvent(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const event = await Event.findOne({ _id: req.params.id, userId });
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const { date, caseDetails, venue, caseManager, status, issue } = req.body;

    if (date !== undefined) {
      const eventDate = dayjs(date).startOf('day').toDate();
      if (dayjs(eventDate).isBefore(dayjs().startOf('day'))) {
        return res.status(400).json({ error: 'Event date must be today or in the future' });
      }
      event.date = eventDate;
    }
    if (caseDetails !== undefined) event.caseDetails = String(caseDetails).trim();
    if (venue !== undefined) event.venue = String(venue).trim();
    if (caseManager !== undefined) event.caseManager = String(caseManager).trim();
    if (status !== undefined && STATUSES.includes(status)) event.status = status;
    if (issue !== undefined) event.issue = String(issue).trim();

    await event.save();

    res.json({
      id: event._id,
      date: event.date,
      caseDetails: event.caseDetails,
      venue: event.venue,
      caseManager: event.caseManager,
      status: event.status,
      issue: event.issue,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

/**
 * DELETE /events/:id
 */
export async function deleteEvent(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const deleted = await Event.findOneAndDelete({ _id: req.params.id, userId });
    if (!deleted) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
