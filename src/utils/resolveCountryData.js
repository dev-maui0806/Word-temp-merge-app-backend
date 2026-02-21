const COUNTRY_DATA = {
  India: {
    Country_Standard_Time: 'Indian Standard Time (IST)',
    Country_Code: '+91',
    Country_Standard_Time_Short: 'IST',
    COUNTRY_CURRENCY_SHORT_NAME: 'INR',
  },
  UAE: {
    Country_Standard_Time: 'Gulf Standard Time (GST)',
    Country_Code: '+971',
    Country_Standard_Time_Short: 'GST',
    COUNTRY_CURRENCY_SHORT_NAME: 'AED',
  },
  Australia: {
    Country_Standard_Time: 'Australian Eastern Standard Time (AEST)',
    Country_Code: '+61',
    Country_Standard_Time_Short: 'AEST',
    COUNTRY_CURRENCY_SHORT_NAME: 'AUD',
  },
};

/**
 * Resolves country-specific data for the Arrange Venue template.
 * @param {string} country - Country name (India | UAE | Australia)
 * @returns {Object} { Country_Standard_Time, Country_Code, Country_Standard_Time_Short, COUNTRY_CURRENCY_SHORT_NAME }
 * @throws {Error} If country is not supported
 */
export function resolveCountryData(country) {
  if (!country || typeof country !== 'string') {
    throw new Error('Country must be a non-empty string');
  }

  const normalized = country.trim();
  const data = COUNTRY_DATA[normalized];

  if (!data) {
    const supported = Object.keys(COUNTRY_DATA).join(', ');
    throw new Error(`Unsupported country: "${country}". Supported: ${supported}`);
  }

  return { ...data };
}
