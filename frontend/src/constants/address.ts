/**
 * Address parsing constants
 *
 * Curated lists of country and state names for address parsing and validation.
 * These constants are used to improve address parsing accuracy and reduce false positives.
 */

/**
 * Curated list of common country names for address parsing
 * Includes common variations and abbreviations
 */
export const COUNTRY_NAMES = [
  'UNITED STATES',
  'USA',
  'UNITED STATES OF AMERICA',
  'CANADA',
  'MEXICO',
  'UNITED KINGDOM',
  'UK',
  'GREAT BRITAIN',
  'FRANCE',
  'GERMANY',
  'ITALY',
  'SPAIN',
  'PORTUGAL',
  'AUSTRALIA',
  'NEW ZEALAND',
  'JAPAN',
  'CHINA',
  'INDIA',
  'BRAZIL',
  'ARGENTINA',
  'CHILE',
  'COLOMBIA',
  'PERU',
  'RUSSIA',
  'SOUTH KOREA',
  'NORTH KOREA',
  'THAILAND',
  'VIETNAM',
  'PHILIPPINES',
  'INDONESIA',
  'MALAYSIA',
  'SINGAPORE',
] as const;

/**
 * Set of country names (uppercase with normalized spacing) for O(1) country name lookups
 * Improves performance and type safety for address parsing country detection
 */
export const COUNTRY_NAMES_SET: ReadonlySet<string> = new Set<string>(COUNTRY_NAMES as readonly string[]);

/**
 * Curated list of US state names for address parsing (normalized without spaces)
 * Used for state detection in address parsing
 */
export const STATE_NAMES = [
  'ALABAMA',
  'ALASKA',
  'ARIZONA',
  'ARKANSAS',
  'CALIFORNIA',
  'COLORADO',
  'CONNECTICUT',
  'DELAWARE',
  'FLORIDA',
  'GEORGIA',
  'HAWAII',
  'IDAHO',
  'ILLINOIS',
  'INDIANA',
  'IOWA',
  'KANSAS',
  'KENTUCKY',
  'LOUISIANA',
  'MAINE',
  'MARYLAND',
  'MASSACHUSETTS',
  'MICHIGAN',
  'MINNESOTA',
  'MISSISSIPPI',
  'MISSOURI',
  'MONTANA',
  'NEBRASKA',
  'NEVADA',
  'NEWHAMPSHIRE',
  'NEWJERSEY',
  'NEWMEXICO',
  'NEWYORK',
  'NORTHCAROLINA',
  'NORTHDAKOTA',
  'OHIO',
  'OKLAHOMA',
  'OREGON',
  'PENNSYLVANIA',
  'RHODEISLAND',
  'SOUTHCAROLINA',
  'SOUTHDAKOTA',
  'TENNESSEE',
  'TEXAS',
  'UTAH',
  'VERMONT',
  'VIRGINIA',
  'WASHINGTON',
  'WESTVIRGINIA',
  'WISCONSIN',
  'WYOMING',
] as const;

/**
 * USPS state codes for precise state detection
 * Used to avoid false positives from generic 2-letter patterns
 */
export const STATE_CODES = new Set([
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
]);

/**
 * Set of US state names (uppercase, no spaces) for O(1) state name lookups
 * Improves performance and type safety for address parsing state detection
 */
export const STATE_NAMES_SET: ReadonlySet<string> = new Set<string>(STATE_NAMES as readonly string[]);

/**
 * ISO country codes for country detection
 * Used to avoid false positives from generic 2-3 letter patterns
 */
export const COUNTRY_CODES = new Set([
  'US',
  'CA',
  'MX',
  'GB',
  'FR',
  'DE',
  'IT',
  'ES',
  'PT',
  'AU',
  'NZ',
  'JP',
  'CN',
  'IN',
  'BR',
  'AR',
  'CL',
  'CO',
  'PE',
  'RU',
  'KR',
  'KP',
  'TH',
  'VN',
  'PH',
  'ID',
  'MY',
  'SG',
]);
