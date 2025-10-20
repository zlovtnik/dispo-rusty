import { test, expect } from 'bun:test';
import { sanitizeUrlForLogging } from './useFetch';

test('removes sensitive token param from absolute URL and returns only pathname+query', () => {
  const url = 'https://api.example.com/auth/callback?token=abc123&next=/app';
  const sanitized = sanitizeUrlForLogging(url);
  expect(sanitized).toBe('/auth/callback?next=%2Fapp');
});

test('removes sensitive token param from relative URL and preserves safe params', () => {
  const url = '/auth/callback?token=abc123&foo=bar&apikey=secret&x=1';
  const sanitized = sanitizeUrlForLogging(url);
  // token and apikey should be removed, remaining query params preserved (order not guaranteed)
  expect(sanitized.startsWith('/auth/callback')).toBe(true);
  expect(sanitized).not.toContain('token=');
  expect(sanitized).not.toContain('apikey=');
  expect(sanitized).toContain('foo=bar');
  expect(sanitized).toContain('x=1');
});

test('returns pathname when query becomes empty after removing sensitive params', () => {
  const url = '/logout?token=abc123';
  const sanitized = sanitizeUrlForLogging(url);
  expect(sanitized).toBe('/logout');
});

test('malformed URL returns redacted-url placeholder', () => {
  const url = 'http://%zz';
  const sanitized = sanitizeUrlForLogging(url);
  expect(sanitized).toBe('redacted-url');
});

test('URL without query parameters returns the same pathname', () => {
  const url = '/api/users';
  const sanitized = sanitizeUrlForLogging(url);
  expect(sanitized).toBe('/api/users');
});

test('URL with only safe parameters preserves all parameters', () => {
  const url = '/api?foo=bar&baz=qux';
  const sanitized = sanitizeUrlForLogging(url);
  expect(sanitized).toBe('/api?foo=bar&baz=qux');
});

test('case-insensitive sensitive keys are removed', () => {
  const urlWithToken = '/api?Token=abc';
  const urlWithTOKEN = '/api?TOKEN=abc';
  const urlWithMixed = '/api?ToKeN=abc';

  const sanitizedToken = sanitizeUrlForLogging(urlWithToken);
  const sanitizedTOKEN = sanitizeUrlForLogging(urlWithTOKEN);
  const sanitizedMixed = sanitizeUrlForLogging(urlWithMixed);

  expect(sanitizedToken).toBe('/api');
  expect(sanitizedTOKEN).toBe('/api');
  expect(sanitizedMixed).toBe('/api');
  expect(sanitizedToken).not.toContain('Token=');
  expect(sanitizedTOKEN).not.toContain('TOKEN=');
  expect(sanitizedMixed).not.toContain('ToKeN=');
});

test('URLs with fragments preserve fragment and remove sensitive params', () => {
  const url = '/page?token=secret#section';
  const sanitized = sanitizeUrlForLogging(url);
  expect(sanitized).toBe('/page#section');
  expect(sanitized).not.toContain('token=');
  expect(sanitized).toContain('#section');
});
