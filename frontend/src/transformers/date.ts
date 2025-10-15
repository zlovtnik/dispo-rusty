import { err, ok } from 'neverthrow';
import type { Result, Option } from '../types/fp';
import { none, some } from '../types/fp';
import type { AppError } from '../types/errors';
import { createValidationError } from '../types/errors';

export interface DateParseOptions {
  readonly context?: string;
  readonly allowEmptyString?: boolean;
}

export interface DateFormatOptions {
  readonly locale?: string;
  readonly timeZone?: string;
  readonly format?: Intl.DateTimeFormatOptions;
}

export interface ZonedDateString {
  readonly isoString: string;
  readonly parts: Record<string, string>;
  readonly timeZone: string;
  readonly locale: string;
}

export interface DatePipelineResult {
  readonly original: Date;
  readonly formatted: string;
  readonly isoString: string;
  readonly timeZone?: string;
  readonly locale: string;
  readonly parts: Record<string, string>;
}

const createDateError = (
  message: string,
  details?: Record<string, unknown>,
  code = 'INVALID_DATE_VALUE',
  cause?: unknown
): AppError => createValidationError(message, details, { code, cause });

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return new Date(value.getTime());
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const trimmed = typeof value === 'string' ? value.trim() : value;
    if (trimmed === '' || trimmed === null) {
      return null;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    return parsed;
  }

  return null;
};

export const parseDate = (
  value: unknown,
  options: DateParseOptions = {}
): Result<Date, AppError> => {
  if ((value === '' || value === undefined || value === null) && options.allowEmptyString) {
    return err(
      createDateError(
        'Date value is empty',
        { context: options.context ?? 'date' },
        'EMPTY_DATE_VALUE'
      )
    );
  }

  const parsed = toDate(value);

  if (!parsed) {
    return err(
      createDateError('Invalid date value', { value, context: options.context ?? 'date' })
    );
  }

  return ok(parsed);
};

export const parseOptionalDate = (
  value: unknown,
  options: DateParseOptions = {}
): Result<Option<Date>, AppError> => {
  if (value === undefined || value === null || value === '') {
    return ok(none());
  }

  return parseDate(value, options).map(some);
};

export const toIsoString = (
  value: Date,
  options?: { context?: string }
): Result<string, AppError> => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return err(
      createDateError(
        'Cannot serialise invalid date',
        { context: options?.context ?? 'date' },
        'INVALID_DATE_SERIALISATION'
      )
    );
  }

  return ok(value.toISOString());
};

export const convertToTimezone = (
  value: Date,
  timeZone: string,
  locale = 'en-US'
): Result<ZonedDateString, AppError> => {
  try {
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const parts = formatter
      .formatToParts(value)
      .reduce<Record<string, string>>((accumulator, part) => {
        if (part.type !== 'literal') {
          accumulator[part.type] = part.value;
        }
        return accumulator;
      }, {});

    const isoString = `${parts.year}-${parts.month}-${parts.day}T${parts.hour ?? '00'}:${parts.minute ?? '00'}:${parts.second ?? '00'}`;

    return ok({
      isoString,
      parts,
      timeZone,
      locale,
    });
  } catch (error) {
    return err(
      createDateError('Invalid time zone provided', { timeZone, locale }, 'INVALID_TIMEZONE', error)
    );
  }
};

export const formatDate = (
  value: Date,
  options: DateFormatOptions = {}
): Result<string, AppError> => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return err(
      createDateError('Cannot format invalid date value', { value }, 'INVALID_DATE_FORMAT')
    );
  }

  try {
    const formatter = new Intl.DateTimeFormat(options.locale ?? 'en-US', {
      timeZone: options.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      ...options.format,
    });

    return ok(formatter.format(value));
  } catch (error) {
    return err(createDateError('Failed to format date', { options }, 'DATE_FORMAT_ERROR', error));
  }
};

export interface DatePipelineOptions extends DateParseOptions, DateFormatOptions {}

export const createDatePipeline =
  (options: DatePipelineOptions = {}): ((value: unknown) => Result<DatePipelineResult, AppError>) =>
  (value: unknown) =>
    parseDate(value, {
      context: options.context,
      allowEmptyString: options.allowEmptyString,
    }).andThen(parsed => {
      const timezoneResult: Result<
        { isoString: string; parts: Record<string, string>; timeZone?: string; locale: string },
        AppError
      > = options.timeZone
        ? convertToTimezone(parsed, options.timeZone, options.locale ?? 'en-US').map(zoned => ({
            isoString: zoned.isoString,
            parts: zoned.parts,
            timeZone: options.timeZone,
            locale: zoned.locale,
          }))
        : toIsoString(parsed, { context: options.context }).map(isoString => ({
            isoString,
            parts: {},
            timeZone: options.timeZone,
            locale: options.locale ?? 'en-US',
          }));

      return timezoneResult.andThen(zoned =>
        formatDate(parsed, options).map(formatted => ({
          original: parsed,
          formatted,
          isoString: zoned.isoString,
          timeZone: zoned.timeZone,
          locale: zoned.locale,
          parts: zoned.parts,
        }))
      );
    });
