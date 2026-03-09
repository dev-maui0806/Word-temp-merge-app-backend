import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import Country from '../src/models/Country.js';
import CountryTimezone from '../src/models/CountryTimezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const ROOT_DIR = path.join(__dirname, '..', '..');
const SINGLE_TZ_PATH = path.join(ROOT_DIR, 'doc', 'final_single_timezone_countries.xlsx');
const MULTI_TZ_PATH = path.join(ROOT_DIR, 'doc', 'multiple time zone countries.xlsx');

function loadSheetRows(filePath) {
  const wb = XLSX.readFile(filePath);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
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
  const name = String(row.country_name || row.country || '').trim();

  const raw =
    row.code ||
    row.country_code_alpha2 ||
    row.country_iso_code ||
    row.country_iso ||
    row.countryCodeAlpha2 ||
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
    const name = String(row.country_name || '').trim();
    if (!name) continue;

    const codeAlpha2 = getAlpha2Code(row);

    const phoneCode = String(row.country_code || row.Country_code || '').trim();
    const currency = String(row.currency_code || '').trim();
    const standardTime = String(row.country_standard_time || '').trim();
    const timeShort = String(row.country_standard_time_short || '').trim();

    const label = `${codeAlpha2} ${name}`;

    await Country.findOneAndUpdate(
      { code: codeAlpha2 },
      {
        name,
        code: codeAlpha2,
        label,
        hasMultipleTimezones: false,
        standardTime: standardTime || null,
        countryCode: phoneCode || null,
        timeShort: timeShort || null,
        currency: currency || null,
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
    const name = String(row.country_name || '').trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(row);
  }

  let countryCount = 0;
  let tzCount = 0;

  for (const [countryName, countryRows] of groups.entries()) {
    const first = countryRows[0];
    const codeAlpha2 = getAlpha2Code(first);

    const fallbackPhone = String(first.country_code || first.Country_code || '').trim();
    const fallbackCurrency = String(first.currency_code || '').trim();

    const label = `${codeAlpha2} ${countryName}`;

    const country = await Country.findOneAndUpdate(
      { code: codeAlpha2 },
      {
        name: countryName,
        code: codeAlpha2,
        label,
        hasMultipleTimezones: true,
        // keep any default time info if present, but it is optional
        countryCode: fallbackPhone || undefined,
        currency: fallbackCurrency || undefined,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    countryCount += 1;

    await CountryTimezone.deleteMany({ country: country._id });

    let order = 0;
    for (const row of countryRows) {
      const cityName = String(row.city_name || '').trim();
      if (!cityName) continue;

      const phoneCode = String(row.country_code || row.Country_code || fallbackPhone || '').trim();
      const currency = String(row.currency_code || fallbackCurrency || '').trim();
      const standardTime = String(row.country_standard_time || '').trim();
      const timeShort = String(row.country_standard_time_short || '').trim();

      await CountryTimezone.create({
        country: country._id,
        cityName,
        standardTime,
        timeShort,
        countryCode: phoneCode || null,
        currency: currency || null,
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
    const multiRows = loadSheetRows(MULTI_TZ_PATH);

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

