import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, refreshTokens } from './client';
import { rentopiaApi } from './endpoints';

const BASE = 'https://api.test';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const unauthorized = () =>
  json(401, { timestamp: '', status: 401, code: 'UNAUTHORIZED', message: 'Authentication is required', path: '/x' });

describe('createApiClient', () => {
  it('sends the bearer token and parses JSON', async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(200, { id: 'u1' }));
    const client = createApiClient({
      baseUrl: `${BASE}/`,
      getAccessToken: () => 'tok',
      refreshAccessToken: async () => null,
      fetch,
    });

    await expect(client.get('/users/profile')).resolves.toEqual({ id: 'u1' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/v1/users/profile`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('refreshes once and retries after a 401', async () => {
    let token = 'old';
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer new' ? json(200, { ok: true }) : unauthorized());
    const refresh = vi.fn(async () => (token = 'new'));
    const client = createApiClient({ baseUrl: BASE, getAccessToken: () => token, refreshAccessToken: refresh, fetch });

    await expect(client.get('/users/profile')).resolves.toEqual({ ok: true });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh between concurrent 401s', async () => {
    let token = 'old';
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Headers(init?.headers).get('Authorization') === 'Bearer new' ? json(200, {}) : unauthorized());
    const refresh = vi.fn(async () => {
      await new Promise(r => setTimeout(r, 10));
      return (token = 'new');
    });
    const client = createApiClient({ baseUrl: BASE, getAccessToken: () => token, refreshAccessToken: refresh, fetch });

    await Promise.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reports session expiry when refresh fails', async () => {
    const onSessionExpired = vi.fn();
    const client = createApiClient({
      baseUrl: BASE,
      getAccessToken: () => 'old',
      refreshAccessToken: async () => null,
      onSessionExpired,
      fetch: async () => unauthorized(),
    });

    await expect(client.get('/users/profile')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does not attach tokens or refresh for public calls', async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json(401, { timestamp: '', status: 401, code: 'INVALID_CREDENTIALS', message: 'bad', path: '/auth/login' }));
    const refresh = vi.fn(async () => 'new');
    const api = rentopiaApi(
      createApiClient({ baseUrl: BASE, getAccessToken: () => 'tok', refreshAccessToken: refresh, fetch }),
    );

    await expect(api.auth.login({ email: 'a@b.c', password: 'x' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(new Headers(fetch.mock.calls[0]![1]?.headers).has('Authorization')).toBe(false);
  });

  it('exposes validation field errors', async () => {
    const client = createApiClient({
      baseUrl: BASE,
      getAccessToken: () => null,
      refreshAccessToken: async () => null,
      fetch: async () =>
        json(400, {
          timestamp: '', status: 400, code: 'VALIDATION_FAILED', message: 'Request validation failed', path: '/x',
          fieldErrors: [{ field: 'email', message: 'must be a well-formed email address' }],
        }),
    });

    const err = await client.post<void>('/auth/register', {}, { auth: false }).then(
      () => { throw new Error('expected the request to fail'); },
      (e: unknown) => e as ApiError,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect(err.fieldError('email')).toBe('must be a well-formed email address');
  });

  it('handles non-JSON errors and network failures', async () => {
    const htmlError = createApiClient({
      baseUrl: BASE, getAccessToken: () => null, refreshAccessToken: async () => null,
      fetch: async () => new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
    });
    await expect(htmlError.get('/x')).rejects.toMatchObject({ status: 502, code: 'HTTP_502' });

    const offline = createApiClient({
      baseUrl: BASE, getAccessToken: () => null, refreshAccessToken: async () => null,
      fetch: async () => { throw new TypeError('Failed to fetch'); },
    });
    await expect(offline.get('/x')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('returns undefined for 204 responses', async () => {
    const client = createApiClient({
      baseUrl: BASE, getAccessToken: () => 't', refreshAccessToken: async () => null,
      fetch: async () => new Response(null, { status: 204 }),
    });
    await expect(client.post('/auth/verify-otp', { purpose: 'VERIFY_EMAIL', code: '123456' })).resolves.toBeUndefined();
  });
});

describe('refreshTokens', () => {
  it('posts the refresh token and returns the new pair', async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      json(200, { accessToken: 'a2', refreshToken: 'r2' }));
    await expect(refreshTokens(BASE, 'r1', fetch)).resolves.toMatchObject({ accessToken: 'a2', refreshToken: 'r2' });
    expect(fetch.mock.calls[0]![0]).toBe(`${BASE}/api/v1/auth/refresh`);
    expect(fetch.mock.calls[0]![1]?.body).toBe(JSON.stringify({ refreshToken: 'r1' }));
  });

  it('surfaces token reuse as an ApiError', async () => {
    const fetch = async () =>
      json(401, { timestamp: '', status: 401, code: 'REFRESH_TOKEN_REUSED', message: 'x', path: '/auth/refresh' });
    await expect(refreshTokens(BASE, 'old', fetch)).rejects.toMatchObject({ code: 'REFRESH_TOKEN_REUSED' });
  });
});
