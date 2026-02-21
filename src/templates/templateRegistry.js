/**
 * Template Registry: Maps action slugs to template configs.
 * Each action has: template file, automation service, and field definitions.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, '.');

/**
 * Field definition for form rendering.
 * @typedef {Object} FieldDef
 * @property {string} name - Variable name (must match template placeholder)
 * @property {string} type - 'text' | 'date' | 'time' | 'number' | 'select' | 'image'
 * @property {string} label - Display label
 * @property {string} [section] - Form section (e.g. 'Dates', 'Venue')
 * @property {boolean} [computed] - If true, not shown in form (backend fills)
 * @property {string[]} [options] - For type 'select'
 * @property {string} [placeholder]
 * @property {boolean} [fullWidth] - Spans both columns
 */

/**
 * @type {Record<string, { template: string; automation: string; fields: FieldDef[] }>}
 */
export const TEMPLATE_REGISTRY = {
  'arrange-venue': {
    template: 'arrangeVenue.docx',
    automation: 'arrangeVenue',
    fields: [
      { name: 'Date_of_FR', type: 'date', label: 'Date of FR', section: 'Dates', computed: false },
      { name: 'Event_Date', type: 'date', label: 'Event Date', section: 'Dates' },
      { name: 'Claimant_Name', type: 'text', label: 'Claimant Name', section: 'Claimant Details', placeholder: 'Full name' },
      { name: 'Event_Type', type: 'text', label: 'Event Type', section: 'Claimant Details', computed: false },
      { name: 'Event_Time', type: 'time', label: 'Event Time', section: 'Times' },
      { name: 'Start_Time_For_Booking_Venue', type: 'time', label: 'Start Time for Booking Venue', section: 'Times' },
      { name: 'Venue_Name', type: 'text', label: 'Venue Name', section: 'Venue Information', placeholder: 'Name' },
      { name: 'Venue_Number', type: 'text', label: 'Venue Number', section: 'Venue Information', placeholder: 'Number' },
      { name: 'Venue_Address', type: 'text', label: 'Venue Address', section: 'Venue Information', placeholder: 'Full address' },
      { name: 'Reception_Person_Name', type: 'text', label: 'Reception Person Name', section: 'Venue Information', placeholder: 'Contact name' },
      { name: 'Meeting_Type', type: 'select', label: 'Meeting Type', section: 'Distance & Options', options: ['Virtual', 'In Person', 'None'], default: 'None' },
      { name: 'Distance_In_Kilometres', type: 'number', label: 'Distance in Kilometres', section: 'Distance & Options', placeholder: 'e.g. 5.2', fullWidth: true },
      { name: 'logo', type: 'image', label: 'Logo / Image', section: 'Attachments', fullWidth: true },
    ],
  },
  'cancel-venue': {
    template: 'cancelVenue.docx',
    automation: 'cancelVenue',
    fields: [],
  },
  'arrange-transportation': {
    template: 'arrangeTransportation.docx',
    automation: 'arrangeTransportation',
    fields: [],
  },
  'cancel-transportation': {
    template: 'cancelTransportation.docx',
    automation: 'cancelTransportation',
    fields: [],
  },
  'arrange-accommodation': {
    template: 'arrangeAccommodation.docx',
    automation: 'arrangeAccommodation',
    fields: [],
  },
  'cancel-accommodation': {
    template: 'cancelAccommodation.docx',
    automation: 'cancelAccommodation',
    fields: [],
  },
  'arrange-notary': {
    template: 'arrangeNotary.docx',
    automation: 'arrangeNotary',
    fields: [],
  },
  'cancel-notary': {
    template: 'cancelNotary.docx',
    automation: 'cancelNotary',
    fields: [],
  },
  'arrange-ent-test': {
    template: 'arrangeENTTest.docx',
    automation: 'arrangeENTTest',
    fields: [],
  },
  'cancel-ent-test': {
    template: 'cancelENTTest.docx',
    automation: 'cancelENTTest',
    fields: [],
  },
  'no-transportation-needed': {
    template: 'noTransportationNeeded.docx',
    automation: 'noTransportationNeeded',
    fields: [],
  },
  'contact-claimant': {
    template: 'contactClaimant.docx',
    automation: 'contactClaimant',
    fields: [],
  },
  'fa-traveled-to-attend': {
    template: 'faTraveledToAttend.docx',
    automation: 'faTraveledToAttend',
    fields: [],
  },
  'fa-booked-flight-ticket': {
    template: 'faBookedFlightTicket.docx',
    automation: 'faBookedFlightTicket',
    fields: [],
  },
  'fa-cancelled-flight-ticket': {
    template: 'faCancelledFlightTicket.docx',
    automation: 'faCancelledFlightTicket',
    fields: [],
  },
  'fa-traveled-back': {
    template: 'faTraveledBack.docx',
    automation: 'faTraveledBack',
    fields: [],
  },
  'fa-attend': {
    template: 'faAttend.docx',
    automation: 'faAttend',
    fields: [],
  },
};

/**
 * Get template path for an action.
 */
export function getTemplatePath(actionSlug) {
  const cfg = TEMPLATE_REGISTRY[actionSlug];
  if (!cfg) return null;
  const path = `${TEMPLATES_DIR}/${cfg.template}`;
  return path;
}

/**
 * Get metadata (fields, template name) for an action.
 * If template has no field config, extract variables from DOCX.
 */
export function getTemplateConfig(actionSlug) {
  return TEMPLATE_REGISTRY[actionSlug] || null;
}
