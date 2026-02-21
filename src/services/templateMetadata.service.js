/**
 * Template Metadata Service: Extract variables from DOCX and infer field config.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { getTemplateConfig, getTemplatePath } from '../templates/templateRegistry.js';

const require = createRequire(import.meta.url);
const InspectModuleFactory = require('docxtemplater/js/inspect-module.js');

/** Default options for known "Type" variables (consistent across all action types) */
const SELECT_OPTIONS_BY_VARIABLE = {
  Meeting_Type: ['Virtual', 'In Person', 'None'],
  Room_Type: ['Single', 'Double', 'Suite', 'Twin', 'None'],
  Notary_Type: ['In Person', 'Virtual', 'None'],
};

/** Infer input type from variable name */
function inferFieldType(name) {
  // Detect image fields: docxtemplater syntax (%variable), or names containing image/photo/picture/logo
  const nameLower = name.toLowerCase();
  if (
    name.startsWith('%') ||
    nameLower === 'logo' ||
    /image|photo|picture|logo/.test(nameLower)
  ) {
    return { type: 'image', label: formatLabel(name), fullWidth: true };
  }
  if (/date|Date/i.test(name)) return { type: 'date', label: formatLabel(name) };
  if (/time|Time/i.test(name)) return { type: 'time', label: formatLabel(name) };
  if (/distance|Distance|Kilometres|Miles|number/i.test(name)) return { type: 'number', label: formatLabel(name) };
  if (/type|Type/.test(name) && name !== 'Event_Type') {
    const options = SELECT_OPTIONS_BY_VARIABLE[name] || ['None'];
    return { type: 'select', label: formatLabel(name), options };
  }
  return { type: 'text', label: formatLabel(name) };
}

function formatLabel(name) {
  const withoutPercent = name.replace(/^%/, '');
  return withoutPercent
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\s+/, '')
    .trim();
}

/** Infer form section from variable name (consistent across all action types) */
function inferSection(name) {
  const n = name.toLowerCase();
  if (n.includes('date') || n.includes('fr')) return 'Dates';
  if (n.includes('claimant') || n.includes('event_type')) return 'Claimant Details';
  if (n.includes('time')) return 'Times';
  if (n.includes('accommodation') || n.includes('hotel') || (n.includes('booking') && n.includes('room'))) return 'Accommodation';
  if (n.includes('notary')) return 'Notary';
  if (n.includes('ent') && (n.includes('test') || n.includes('exam'))) return 'ENT Test';
  if (n.includes('venue') || n.includes('reception')) return 'Venue Information';
  if (n.includes('distance') || n.includes('meeting') || n.includes('type')) return 'Distance & Options';
  if (n.includes('logo') || n.includes('image') || n.includes('photo') || n.includes('picture') || n.startsWith('%')) return 'Attachments';
  return 'General';
}

/**
 * Extract variable names from DOCX using Docxtemplater's InspectModule.
 * This properly handles XML formatting and extracts only variable names.
 * @param {string} templatePath - Absolute path to .docx
 * @returns {string[]} Variable names
 */
export function extractVariablesFromDocx(templatePath) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`);
  }

  const content = fs.readFileSync(templatePath, 'binary');
  const zip = new PizZip(content);
  const inspectModule = InspectModuleFactory();

  const doc = new Docxtemplater(zip, {
    delimiters: { start: '{{', end: '}}' },
    modules: [inspectModule],
    nullGetter: () => '', // Return empty string for missing variables during inspection
  });

  try {
    // Try to render with empty data to trigger inspection
    doc.render({});
  } catch (err) {
    // Ignore rendering errors - we only need variable extraction
    // Some errors are expected when variables are missing
  }

  let parts;
  try {
    parts = inspectModule.getStructuredTags();
  } catch (err) {
    throw new Error(`Failed to extract tags: ${err.message}`);
  }

  if (!parts || !Array.isArray(parts)) {
    return [];
  }

  const variables = new Set();

  function collectTags(partsList) {
    if (!partsList || !Array.isArray(partsList)) return;
    for (const part of partsList) {
      if (part && typeof part === 'object') {
        if (part.value && typeof part.value === 'string') {
          const name = part.value.trim();
          // Skip loop/condition markers, empty values, and XML-like content
          if (
            name &&
            !name.startsWith('#') &&
            !name.startsWith('/') &&
            !name.includes('<') &&
            !name.includes('>') &&
            !name.includes('w:') &&
            name !== ''
          ) {
            variables.add(name);
          }
        }
        if (part.subparsed) collectTags(part.subparsed);
      }
    }
  }

  collectTags(parts);

  // Scan all XML in the DOCX for placeholders (so we don't miss any, and we always get image tags)
  // 1) {{name}} - text/other variables (InspectModule may have already found these)
  // 2) {%name} - standalone image placeholders (if templates use this directly)
  // 3) {{%name}} - image placeholders wrapped in delimiters (ImageModule syntax with {{}} delimiters)
  if (zip.files) {
    const textPlaceholderRegex = /\{\{([^}#/]+)\}\}/g;
    const imagePlaceholderStandaloneRegex = /\{%([^}#/]+)\}/g;
    const imagePlaceholderWrappedRegex = /\{\{%([^}#/]+)\}\}/g;
    for (const filePath of Object.keys(zip.files)) {
      if (!filePath.endsWith('.xml')) continue;
      const f = zip.file(filePath);
      if (!f) continue;
      let text;
      try {
        text = f.asText();
      } catch {
        continue;
      }
      if (!text || typeof text !== 'string') continue;
      const addName = (name, isImage = false) => {
        let n = name.trim();
        // CRITICAL: ImageModule strips '%' prefix when parsing {{%logo}}, so normalize image keys
        // For {{%logo}}, ImageModule extracts "logo" (without %), so we must store it as "logo"
        if (isImage && n.startsWith('%')) {
          n = n.substring(1); // Remove % prefix for image placeholders
        }
        if (
          n &&
          !n.startsWith('#') &&
          !n.startsWith('/') &&
          !n.includes('<') &&
          !n.includes('>') &&
          !n.includes('w:') &&
          /^[A-Za-z0-9_]+$/.test(n)
        ) {
          variables.add(n);
        }
      };
      let match;
      // Extract text variables: {{name}}
      while ((match = textPlaceholderRegex.exec(text)) !== null) {
        const name = match[1].trim();
        // Skip if it's an image placeholder (starts with %)
        if (!name.startsWith('%')) {
          addName(name, false);
        }
      }
      // Extract standalone image placeholders: {%name} - normalize by removing %
      while ((match = imagePlaceholderStandaloneRegex.exec(text)) !== null) addName(match[1], true);
      // Extract wrapped image placeholders: {{%name}} - normalize by removing %
      while ((match = imagePlaceholderWrappedRegex.exec(text)) !== null) addName(match[1], true);
    }
  }

  return [...variables];
}

/**
 * Get form metadata for an action: fields to display, template path, automation.
 * Uses registry config when available; otherwise extracts from DOCX and infers types.
 */
export function getTemplateMetadata(actionSlug) {
  const config = getTemplateConfig(actionSlug);
  const templatePath = getTemplatePath(actionSlug);

  if (!config || !templatePath) {
    return { ok: false, error: `Unknown action: ${actionSlug}` };
  }

  if (!fs.existsSync(templatePath)) {
    return { ok: false, error: `Template file not found: ${config.template}` };
  }

  const inputFields = (config.fields || []).filter((f) => !f.computed);
  let fields = inputFields;

  if (fields.length === 0) {
    try {
      const extracted = extractVariablesFromDocx(templatePath);
      fields = extracted
        .filter((name) => !isComputedVariable(name))
        .map((name) => {
          // CRITICAL: Normalize field names - remove '%' prefix for image fields
          // ImageModule strips '%' when parsing {{%logo}}, so field names must match
          // This ensures frontend uses "logo" not "%logo" as the key
          const normalizedName = name.startsWith('%') ? name.substring(1) : name;
          const inferred = inferFieldType(normalizedName);
          const section = inferSection(normalizedName);
          return { name: normalizedName, ...inferred, section };
        });
      // Sort fields by section and name for consistent display (all action types)
      // Attachments (image fields) always appear at the bottom, after all other sections
      fields.sort((a, b) => {
        const sectionOrder = ['Dates', 'Claimant Details', 'Times', 'Venue Information', 'Accommodation', 'Notary', 'ENT Test', 'Distance & Options', 'General', 'Attachments'];
        const aIdx = sectionOrder.indexOf(a.section);
        const bIdx = sectionOrder.indexOf(b.section);
        if (aIdx !== bIdx) return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      return { ok: false, error: `Failed to extract variables: ${err.message}` };
    }
  }

  return {
    ok: true,
    actionSlug,
    template: config.template,
    automation: config.automation,
    fields,
  };
}

/** Variables typically computed by automation (not user input) */
function isComputedVariable(name) {
  const computed = [
    'Event_Day',
    'Country_Standard_Time',
    'Country_Code',
    'Country_Standard_Time_Short',
    'COUNTRY_CURRENCY_SHORT_NAME',
    'End_Time_For_Booking_Venue',
    'Start_Time_For_Report_Preparation',
    'End_Time_For_Report_Preparation',
    'Total_Time',
    'Service_Time',
    'Distance_In_Miles',
  ];
  return computed.includes(name);
}
