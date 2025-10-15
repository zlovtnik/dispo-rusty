import { describe, it, expect, beforeEach } from 'bun:test';
import { createHash } from 'node:crypto';

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const ensureTestEnv = () => {
  const meta = import.meta as unknown as { env?: Record<string, string> };
  meta.env ??= {};
  const env = meta.env;
  env.VITE_API_URL ??= 'https://example.test/api';
  env.VITE_APP_NAME ??= 'Test App';
  env.VITE_JWT_STORAGE_KEY ??= 'auth_token';
  env.VITE_DEFAULT_COUNTRY ??= 'US';
  env.VITE_ENABLE_PWNED_PASSWORD_CHECK ??= 'true';
};

const loadAuthRules = async () => {
  ensureTestEnv();
  return import('../authRules');
};

describe('validatePasswordStrength breach detection', () => {
  beforeEach(ensureTestEnv);

  it('rejects passwords present in HIBP results', async () => {
    const { validatePasswordStrength, DEFAULT_PASSWORD_REQUIREMENTS } = await loadAuthRules();
    const password = 'Password123!';
    const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);
    let callCount = 0;

    const stubFetch: FetchStub = async (input: RequestInfo | URL) => {
      callCount += 1;
      expect(String(input)).toContain(`/range/${prefix}`);
      return new Response(`${suffix}:42\n`);
    };

    const result = await validatePasswordStrength(
      password,
      DEFAULT_PASSWORD_REQUIREMENTS,
      undefined,
      {
        enabled: true,
        endpoint: 'https://pwned.test/range',
        cacheTtlMs: 1000,
        requestTimeoutMs: 1000,
        maxRetries: 0,
        initialBackoffMs: 1,
        maxBackoffMs: 1,
        backoffFactor: 1,
        rateLimitIntervalMs: 0,
        userAgent: 'test-suite',
        fetchImplementation: stubFetch,
      }
    );

    expect(callCount).toBe(1);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('COMMON_PASSWORD');
      if (result.error.type === 'COMMON_PASSWORD') {
        expect(result.error.source).toBe('REMOTE');
        expect(result.error.occurrences).toBe(42);
      }
    }
  });

  it('uses local fallback when remote checks are disabled', async () => {
    const { validatePasswordStrength, DEFAULT_PASSWORD_REQUIREMENTS } = await loadAuthRules();
    const result = await validatePasswordStrength(
      'Password1!',
      DEFAULT_PASSWORD_REQUIREMENTS,
      undefined,
      {
        enabled: false,
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('COMMON_PASSWORD');
      if (result.error.type === 'COMMON_PASSWORD') {
        expect(result.error.source).toBe('LOCAL');
      }
    }
  });

  it('falls back to local data when remote request fails', async () => {
    const { validatePasswordStrength, DEFAULT_PASSWORD_REQUIREMENTS } = await loadAuthRules();
    const failingFetch: FetchStub = async () => Promise.reject(new Error('network offline'));

    const result = await validatePasswordStrength(
      'Password1!',
      DEFAULT_PASSWORD_REQUIREMENTS,
      undefined,
      {
        enabled: true,
        endpoint: 'https://pwned.test/range',
        cacheTtlMs: 1000,
        requestTimeoutMs: 1000,
        maxRetries: 0,
        initialBackoffMs: 1,
        maxBackoffMs: 1,
        backoffFactor: 1,
        rateLimitIntervalMs: 0,
        userAgent: 'test-suite',
        fetchImplementation: failingFetch,
      }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe('COMMON_PASSWORD');
      if (result.error.type === 'COMMON_PASSWORD') {
        expect(result.error.source).toBe('LOCAL');
      }
    }
  });

  it('logs a warning but allows strong passwords when remote data is unavailable', async () => {
    const { validatePasswordStrength, DEFAULT_PASSWORD_REQUIREMENTS } = await loadAuthRules();
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    };

    try {
      const silentFetch: FetchStub = async () => Promise.reject(new Error('timeout'));

      const result = await validatePasswordStrength(
        'Complex!Passw0rd',
        DEFAULT_PASSWORD_REQUIREMENTS,
        undefined,
        {
          enabled: true,
          endpoint: 'https://pwned.test/range',
          cacheTtlMs: 1000,
          requestTimeoutMs: 1000,
          maxRetries: 0,
          initialBackoffMs: 1,
          maxBackoffMs: 1,
          backoffFactor: 1,
          rateLimitIntervalMs: 0,
          userAgent: 'test-suite',
          fetchImplementation: silentFetch,
        }
      );

      expect(result.isOk()).toBe(true);
      expect(warnings.length).toBeGreaterThan(0);
    } finally {
      console.warn = originalWarn;
    }
  });
});
