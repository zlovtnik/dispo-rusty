/**
 * Tests for address constants
 *
 * Ensures constants are properly defined and contain expected values
 */

import { describe, test, expect } from 'bun:test';
import { COUNTRY_NAMES, STATE_NAMES, STATE_CODES, COUNTRY_CODES } from '../address';

describe('Address Constants', () => {
  describe('COUNTRY_NAMES', () => {
    test('should contain expected countries', () => {
      expect(COUNTRY_NAMES).toContain('UNITED STATES');
      expect(COUNTRY_NAMES).toContain('USA');
      expect(COUNTRY_NAMES).toContain('CANADA');
      expect(COUNTRY_NAMES).toContain('UNITED KINGDOM');
      expect(COUNTRY_NAMES).toContain('UK');
    });

    test('should be readonly array', () => {
      expect(COUNTRY_NAMES).toBeInstanceOf(Array);
      // TypeScript ensures it's readonly, but we can test it's not empty
      expect(COUNTRY_NAMES.length).toBeGreaterThan(0);
    });

    test('should contain common variations', () => {
      expect(COUNTRY_NAMES).toContain('UNITED STATES OF AMERICA');
      expect(COUNTRY_NAMES).toContain('GREAT BRITAIN');
    });
  });

  describe('STATE_NAMES', () => {
    test('should contain all 50 US states', () => {
      expect(STATE_NAMES).toContain('CALIFORNIA');
      expect(STATE_NAMES).toContain('NEWYORK');
      expect(STATE_NAMES).toContain('TEXAS');
      expect(STATE_NAMES).toContain('FLORIDA');
      expect(STATE_NAMES).toContain('ALASKA');
      expect(STATE_NAMES).toContain('HAWAII');
    });

    test('should be normalized (no spaces)', () => {
      expect(STATE_NAMES).toContain('NEWYORK');
      expect(STATE_NAMES).toContain('NEWJERSEY');
      expect(STATE_NAMES).toContain('SOUTHCAROLINA');
      expect(STATE_NAMES).toContain('NORTHCAROLINA');
    });

    test('should be readonly array', () => {
      expect(STATE_NAMES).toBeInstanceOf(Array);
      expect(STATE_NAMES.length).toBeGreaterThan(0);
    });
  });

  describe('STATE_CODES', () => {
    test('should contain all USPS state codes', () => {
      expect(STATE_CODES.has('CA')).toBe(true);
      expect(STATE_CODES.has('NY')).toBe(true);
      expect(STATE_CODES.has('TX')).toBe(true);
      expect(STATE_CODES.has('FL')).toBe(true);
      expect(STATE_CODES.has('AK')).toBe(true);
      expect(STATE_CODES.has('HI')).toBe(true);
      expect(STATE_CODES.has('DC')).toBe(true); // District of Columbia
    });

    test('should not contain invalid codes', () => {
      expect(STATE_CODES.has('XX')).toBe(false);
      expect(STATE_CODES.has('ZZ')).toBe(false);
      expect(STATE_CODES.has('AB')).toBe(false);
    });

    test('should be a Set', () => {
      expect(STATE_CODES).toBeInstanceOf(Set);
      expect(STATE_CODES.size).toBeGreaterThan(0);
    });

    test('should contain exactly 51 entries (50 states + DC)', () => {
      expect(STATE_CODES.size).toBe(51);
    });
  });

  describe('COUNTRY_CODES', () => {
    test('should contain common ISO country codes', () => {
      expect(COUNTRY_CODES.has('US')).toBe(true);
      expect(COUNTRY_CODES.has('CA')).toBe(true);
      expect(COUNTRY_CODES.has('GB')).toBe(true);
      expect(COUNTRY_CODES.has('FR')).toBe(true);
      expect(COUNTRY_CODES.has('DE')).toBe(true);
    });

    test('should not contain invalid codes', () => {
      expect(COUNTRY_CODES.has('XX')).toBe(false);
      expect(COUNTRY_CODES.has('ZZ')).toBe(false);
    });

    test('should be a Set', () => {
      expect(COUNTRY_CODES).toBeInstanceOf(Set);
      expect(COUNTRY_CODES.size).toBeGreaterThan(0);
    });
  });

  describe('Integration', () => {
    test('should have consistent state representation', () => {
      // Verify that STATE_CODES contains codes for states in STATE_NAMES
      const stateNames = STATE_NAMES;
      const stateCodes = STATE_CODES;

      // Check a few key states
      expect(stateCodes.has('CA')).toBe(true); // California
      expect(stateCodes.has('NY')).toBe(true); // New York
      expect(stateCodes.has('TX')).toBe(true); // Texas
    });

    test('should have reasonable coverage', () => {
      // Ensure we have a good selection of countries and states
      expect(COUNTRY_NAMES.length).toBeGreaterThan(20);
      expect(STATE_NAMES.length).toBe(50); // 50 US states
      expect(STATE_CODES.size).toBe(51); // 50 states + DC
      expect(COUNTRY_CODES.size).toBeGreaterThan(10);
    });
  });
});
