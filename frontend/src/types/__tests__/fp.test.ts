import { describe, it, expect } from 'bun:test';
import { some, none, fromNullable, mapOption, unwrapOr, isSome, isNone } from '../fp';

describe('Option utilities', () => {
  describe('some', () => {
    it('should create a Some option with the given value', () => {
      const option = some(42);
      expect(isSome(option)).toBe(true);
      if (isSome(option)) {
        expect(option.value).toBe(42);
      }
    });

    it('should work with different types', () => {
      const stringOption = some('hello');
      expect(isSome(stringOption)).toBe(true);
      if (isSome(stringOption)) {
        expect(stringOption.value).toBe('hello');
      }

      const objectOption = some({ key: 'value' });
      expect(isSome(objectOption)).toBe(true);
      if (isSome(objectOption)) {
        expect(objectOption.value).toEqual({ key: 'value' });
      }
    });
  });

  describe('none', () => {
    it('should create a None option', () => {
      const option = none();
      expect(isNone(option)).toBe(true);
    });
  });

  describe('fromNullable', () => {
    it('should return Some for non-null values', () => {
      const option = fromNullable(42);
      expect(isSome(option)).toBe(true);
      if (isSome(option)) {
        expect(option.value).toBe(42);
      }
    });

    it('should return Some for falsy but non-null values', () => {
      expect(isSome(fromNullable(0))).toBe(true);
      expect(isSome(fromNullable(''))).toBe(true);
      expect(isSome(fromNullable(false))).toBe(true);
    });

    it('should return None for null', () => {
      const option = fromNullable(null);
      expect(isNone(option)).toBe(true);
    });

    it('should return None for undefined', () => {
      const option = fromNullable(undefined);
      expect(isNone(option)).toBe(true);
    });
  });

  describe('mapOption', () => {
    it('should apply function to Some value and return Some with transformed value', () => {
      const option = some(5);
      const result = mapOption(option, x => x * 2);
      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(10);
      }
    });

    it('should return None when mapping over None', () => {
      const option = none();
      const result = mapOption(option, x => x * 2);
      expect(isNone(result)).toBe(true);
    });

    it('should work with type transformations', () => {
      const option = some('42');
      const result = mapOption<string, number>(option, s => parseInt(s, 10));
      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(42);
      }
    });
  });

  describe('unwrapOr', () => {
    it('should return the value for Some option', () => {
      const option = some(42);
      const result = unwrapOr(option, 0);
      expect(result).toBe(42);
    });

    it('should return the default value for None option', () => {
      const option = none<number>();
      const result = unwrapOr(option, 100);
      expect(result).toBe(100);
    });

    it('should work with different default types', () => {
      const numberOption = none<number>();
      expect(unwrapOr(numberOption, 100)).toBe(100);

      const stringOption = none<string>();
      expect(unwrapOr(stringOption, 'fallback')).toBe('fallback');

      const nullOption = none<null>();
      expect(unwrapOr(nullOption, null)).toBe(null);
    });
  });

  describe('Option chaining', () => {
    it('should support chaining operations', () => {
      const result = mapOption(fromNullable('123'), s => parseInt(s, 10));

      expect(isSome(result)).toBe(true);
      if (isSome(result)) {
        expect(result.value).toBe(123);
      }
    });

    it('should handle None in chained operations', () => {
      const result = mapOption(fromNullable<string>(null), s => parseInt(s, 10));

      expect(isNone(result)).toBe(true);
    });

    it('should combine mapOption and unwrapOr', () => {
      // Some case
      const someResult = unwrapOr(
        mapOption(some(10), x => x * 2),
        0
      );
      expect(someResult).toBe(20);

      // None case
      const noneResult = unwrapOr(
        mapOption(none<number>(), x => x * 2),
        0
      );
      expect(noneResult).toBe(0);
    });
  });
});
