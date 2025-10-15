import { describe, it, expect } from 'bun:test';
import { normalizePersonDTO, type PersonDTO } from '@/types/person';
import { Gender } from '@/types/contact';
import { asContactId } from '@/types/ids';
import {
  resolveContactId,
  parseContactName,
  resolveContactGender,
  normalizeContactAddress,
} from '../AddressBookPage';

const createPerson = (overrides: Record<string, unknown> = {}): PersonDTO =>
  normalizePersonDTO({
    id: 'contact-1',
    tenant_id: 'tenant-1',
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    is_active: true,
    ...overrides,
  });

describe('AddressBook helper functions', () => {
  describe('resolveContactId', () => {
    it('uses trimmed string identifiers when available', () => {
      const person = createPerson({ id: '  contact-999  ' });
      const result = resolveContactId(person, () => asContactId('fallback'));
      expect(result).toEqual(asContactId('contact-999'));
    });

    it('handles numeric identifiers by converting to string', () => {
      const person = createPerson({ id: 42 });
      const result = resolveContactId(person, () => asContactId('fallback'));
      expect(result).toEqual(asContactId('42'));
    });

    it('falls back when identifier is missing', () => {
      const person = createPerson({ id: undefined });
      const fallbackId = asContactId('generated-id');
      const result = resolveContactId(person, () => fallbackId);
      expect(result).toBe(fallbackId);
    });
  });

  describe('parseContactName', () => {
    it('prefers canonical name field when present', () => {
      const person = createPerson({ full_name: 'Ada Lovelace ' });
      const result = parseContactName(person);
      expect(result).toEqual({ rawName: 'Ada Lovelace', firstName: 'Ada', lastName: 'Lovelace' });
    });

    it('builds name from first and last names when needed', () => {
      const person = createPerson({ first_name: 'Grace', last_name: 'Hopper' });
      const result = parseContactName(person);
      expect(result).toEqual({ rawName: 'Grace Hopper', firstName: 'Grace', lastName: 'Hopper' });
    });

    it('handles missing data gracefully', () => {
      const person = createPerson({ id: undefined, first_name: undefined, last_name: undefined });
      const result = parseContactName(person);
      expect(result).toEqual({ rawName: '', firstName: '', lastName: '' });
    });
  });

  describe('resolveContactGender', () => {
    it('resolves gender from string values', () => {
      expect(resolveContactGender(createPerson({ gender: Gender.male }))).toBe(Gender.male);
      expect(resolveContactGender(createPerson({ gender: Gender.female }))).toBe(Gender.female);
    });

    it('uses boolean gender representations', () => {
      const personTrue = createPerson({ gender: true });
      const personFalse = createPerson({ gender: false });
      expect(resolveContactGender(personTrue)).toBe(Gender.male);
      expect(resolveContactGender(personFalse)).toBe(Gender.female);
    });

    it('maps other representations to Gender.other when possible', () => {
      const person = createPerson({ gender: 'non-binary' });
      expect(resolveContactGender(person)).toBe(Gender.other);
    });
  });

  describe('normalizeContactAddress', () => {
    const defaultCountry = 'Wonderland';

    it('normalises structured address objects', () => {
      const person = createPerson({
        address: {
          street1: ' 123 Main St ',
          street2: 'Apt 4',
          city: 'Metropolis',
          state: 'NY',
          zipCode: '10001',
          country: ' USA ',
        },
      });

      const result = normalizeContactAddress(person, defaultCountry);
      expect(result).toEqual({
        street1: '123 Main St',
        street2: 'Apt 4',
        city: 'Metropolis',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
      });
    });

    it('derives street1 from legacy address field when needed', () => {
      const person = createPerson({
        address: {
          address: '42 Galaxy Way',
          city: 'Space City',
        },
      });

      const result = normalizeContactAddress(person, defaultCountry);
      expect(result).toEqual({
        street1: '42 Galaxy Way',
        street2: undefined,
        city: 'Space City',
        state: '',
        zipCode: '',
        country: defaultCountry,
      });
    });

    it('handles string addresses by mapping to street1 and default fields', () => {
      const person = createPerson({ address: 'Planet Express' });
      const result = normalizeContactAddress(person, defaultCountry);
      expect(result).toEqual({
        street1: 'Planet Express',
        street2: undefined,
        city: '',
        state: '',
        zipCode: '',
        country: defaultCountry,
      });
    });

    it('returns undefined when no address is provided', () => {
      const person = createPerson({ address: undefined });
      const result = normalizeContactAddress(person, defaultCountry);
      expect(result).toBeUndefined();
    });
  });
});
