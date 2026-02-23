/**
 * Seed initial countries. Run: node scripts/seedCountries.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Country from '../src/models/Country.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const INITIAL_COUNTRIES = [
  { name: 'India', code: 'IN', label: 'IN India', standardTime: 'Indian Standard Time (IST)', countryCode: '+91', timeShort: 'IST', currency: 'INR', order: 0 },
  { name: 'UAE', code: 'AE', label: 'AE UAE', standardTime: 'Gulf Standard Time (GST)', countryCode: '+971', timeShort: 'GST', currency: 'AED', order: 1 },
  { name: 'Australia', code: 'AU', label: 'AU Australia', standardTime: 'Australian Eastern Standard Time (AEST)', countryCode: '+61', timeShort: 'AEST', currency: 'AUD', order: 2 },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/word-template-merge');
  for (const c of INITIAL_COUNTRIES) {
    await Country.findOneAndUpdate(
      { code: c.code },
      c,
      { upsert: true, new: true }
    );
    console.log(`Seeded country: ${c.name}`);
  }
  await mongoose.disconnect();
  console.log('Done.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
