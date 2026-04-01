import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import Country from '../src/models/Country.js';
import CountryTimezone from '../src/models/CountryTimezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const ROOT_DIR = path.join(__dirname, '..', '..');
const SINGLE_TZ_PATH = path.join(ROOT_DIR, 'doc', 'final_single_timezone_countries.xlsx');
const MULTI_TZ_PATH_CANDIDATES = [
  path.join(ROOT_DIR, 'doc', 'multiple_timezone_countries.xlsx'),
  path.join(ROOT_DIR, 'doc', 'multiple time zone countries.xlsx'),
];

function normalizeKeyName(k) {
  return String(k || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function rowGet(row, ...keys) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const v = row[key];
      if (v != null && String(v).trim() !== '') return v;
    }
  }
  return '';
}

function normalizeRows(rows) {
  return (rows || []).map((row) => {
    const out = {};
    for (const [k, v] of Object.entries(row || {})) {
      out[normalizeKeyName(k)] = v;
    }
    return out;
  });
}

function loadSheetRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return normalizeRows(rows);
}

function resolveMultiTimezonePath() {
  for (const p of MULTI_TZ_PATH_CANDIDATES) {
    if (p && fs.existsSync(p)) return p;
  }
  return MULTI_TZ_PATH_CANDIDATES[0];
}

const ALPHA2_OVERRIDES = {
  'United States': 'US',
  Canada: 'CA',
  Australia: 'AU',
  Russia: 'RU',
  Brazil: 'BR',
  Indonesia: 'ID',
  India: 'IN',
  'United Arab Emirates': 'AE',
  'New Zealand': 'NZ',
  'South Africa': 'ZA',
  'United Kingdom': 'GB',
};

function getAlpha2Code(row) {
  const name = String(rowGet(row, 'country_name', 'country') || '').trim();

  const raw =
    rowGet(
      row,
      'code',
      'country_code_alpha2',
      'country_iso_code',
      'country_iso',
      'countrycodealpha2',
      'country_code'
    ) ||
    '';
  let v = String(raw || '').trim().toUpperCase();
  if (v) return v;

  if (!name) {
    return null;
  }

  if (ALPHA2_OVERRIDES[name]) {
    return ALPHA2_OVERRIDES[name];
  }

  const parts = name.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

async function importSingleTimezoneCountries(rows) {
  let count = 0;
  for (const row of rows) {
    const name = String(rowGet(row, 'country_name', 'country') || '').trim();
    if (!name) continue;

    const codeAlpha2 = getAlpha2Code(row);
    if (!codeAlpha2) continue;

    const phoneCode = String(rowGet(row, 'dial_code', 'country_code') || '').trim();
    const currency = String(rowGet(row, 'currency_code', 'currency') || '').trim();
    const standardTime = String(rowGet(row, 'timezone_name', 'country_standard_time', 'standard_time') || '').trim();
    const timeShort = String(rowGet(row, 'timezone_short', 'time_zone_short', 'country_standard_time_short', 'time_short') || '').trim();
    const ianaTimeZone = String(
      rowGet(row, 'iana_time_zone', 'iana_timezone', 'timezone_iana')
    ).trim();

    const label = `${codeAlpha2} ${name}`;

    await Country.findOneAndUpdate(
      { name },
      {
        name,
        code: codeAlpha2,
        label,
        hasMultipleTimezones: false,
        standardTime: standardTime || null,
        countryCode: phoneCode || null,
        timeShort: timeShort || null,
        currency: currency || null,
        ianaTimeZone: ianaTimeZone || null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  console.log(`Imported/updated ${count} single-timezone countries.`);
}

async function importMultiTimezoneCountries(rows) {
  const groups = new Map();
  for (const row of rows) {
    const name = String(rowGet(row, 'country_name', 'country') || '').trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }

  let countryCount = 0;
  let tzCount = 0;

  for (const [countryName, countryRows] of groups.entries()) {
    const first = countryRows[0];
    const codeAlpha2 = getAlpha2Code(first);

    const fallbackPhone = String(rowGet(first, 'dial_code', 'country_code') || '').trim();
    const fallbackCurrency = String(rowGet(first, 'currency_code', 'currency') || '').trim();

    const label = `${codeAlpha2} ${countryName}`;
    const firstIanaTimeZone = String(
      rowGet(first, 'iana_time_zone', 'iana_timezone', 'timezone_iana')
    ).trim();

    const country = await Country.findOneAndUpdate(
      { name: countryName },
      {
        name: countryName,
        code: codeAlpha2,
        label,
        hasMultipleTimezones: true,
        // keep any default time info if present, but it is optional
        countryCode: fallbackPhone || undefined,
        currency: fallbackCurrency || undefined,
        ianaTimeZone: firstIanaTimeZone || undefined,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    countryCount += 1;

    await CountryTimezone.deleteMany({ country: country._id });

    let order = 0;
    for (const row of countryRows) {
      const cityName = String(rowGet(row, 'city_name', 'city') || '').trim();
      if (!cityName) continue;

      const phoneCode = String(rowGet(row, 'dial_code', 'country_code') || fallbackPhone || '').trim();
      const currency = String(rowGet(row, 'currency_code', 'currency') || fallbackCurrency || '').trim();
      const standardTime = String(rowGet(row, 'country_standard_time', 'timezone_name', 'standard_time') || '').trim();
      const timeShort = String(rowGet(row, 'country_standard_time_short', 'time_zone_short', 'timezone_short', 'time_short') || '').trim();
      const ianaTimeZone = String(
        rowGet(row, 'iana_time_zone', 'iana_timezone', 'timezone_iana')
      ).trim();

      await CountryTimezone.create({
        country: country._id,
        cityName,
        standardTime,
        timeShort,
        countryCode: phoneCode || null,
        currency: currency || null,
        ianaTimeZone: ianaTimeZone || null,
        order,
      });
      order += 1;
      tzCount += 1;
    }
  }

  console.log(
    `Imported/updated ${countryCount} multi-timezone countries with ${tzCount} city/timezone rows.`
  );
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/word-template-merge';
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  try {
    const singleRows = loadSheetRows(SINGLE_TZ_PATH);
    const multiPath = resolveMultiTimezonePath();
    const multiRows = loadSheetRows(multiPath);

    await importSingleTimezoneCountries(singleRows);
    await importMultiTimezoneCountries(multiRows);

    console.log('Country import from Excel completed.');
  } catch (err) {
    console.error('Country import failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

