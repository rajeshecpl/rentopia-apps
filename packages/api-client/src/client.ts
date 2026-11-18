import type { ApiErrorBody, AuthResponse } from './types';

/** Thrown for every non-2xx response, and for network failures (status 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: { field: string; message: string }[];
  readonly body?: ApiErrorBody;

  constructor(status: number, code: string, message: string, body?: ApiErrorBody) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = body?.fieldErrors ?? [];
    this.body = body;
  }

  /** Message for one form field, if the server rejected it. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors.find(f => f.field === field)?.message;
  }
}

export interface ApiClientOptions {
  /** API origin without a path, e.g. "https://api-dev.rentopia.in". */
  baseUrl: string;
  /** Current access token, or null when signed out. */
  getAccessToken: () => string | null | Promise<string | null>;
  /**
   * Obtain a new access token (and store the rotated refresh token).
   * Return null when the session is over; the client then gives up.
   * Web: call the Next.js /api/auth/refresh route (refresh token in an httpOnly cookie).
   * Mobile: use {@link refreshTokens} with the refresh token from secure storage.
   */
  refreshAccessToken: () => Promise<string | null>;
  /** Called when refresh fails, e.g. to clear state and show the login screen. */
  onSessionExpired?: () => void;
  /** Override for tests or non-standard runtimes. */
  fetch?: typeof fetch;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON body; serialised automatically. */
  json?: unknown;
  /** Set false for public endpoints so no token or refresh is attempted. */
  auth?: boolean;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, json?: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, json?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, json?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
}

/**
 * Creates a client for `${baseUrl}/api/v1`.
 *
 * On a 401 it refreshes the access token once and retries once. Concurrent
 * 401s share a single refresh call: the API treats a reused refresh token as
 * theft and logs the user out everywhere, so two parallel refreshes must never happen.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const root = `${options.baseUrl.replace(/\/+$/, '')}/api/v1`;
  let refreshing: Promise<string | null> | null = null;

  function refreshOnce(): Promise<string | null> {
    if (!refreshing) {
      refreshing = options
        .refreshAccessToken()
        .catch(() => null)
        .finally(() => {
          refreshing = null;
        });
    }
    return refreshing;
  }

  async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
    const { json, auth: _auth, headers, ...init } = opts;
    const h = new Headers(headers);
    if (json !== undefined) h.set('Content-Type', 'application/json');
    h.set('Accept', 'application/json');
    if (token) h.set('Authorization', `Bearer ${token}`);
    try {
      return await doFetch(`${root}${path}`, {
        ...init,
        headers: h,
        body: json === undefined ? undefined : JSON.stringify(json),
      });
    } catch (e) {
      throw new ApiError(0, 'NETWORK_ERROR', e instanceof Error ? e.message : 'Network request failed');
    }
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const useAuth = opts.auth !== false;
    let token = useAuth ? await options.getAccessToken() : null;
    let res = await send(path, opts, token);

    if (res.status === 401 && useAuth) {
      token = await refreshOnce();
      if (!token) {
        options.onSessionExpired?.();
        throw await toError(res);
      }
      res = await send(path, opts, token);
    }

    if (!res.ok) throw await toError(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    request,
    get: (path, o) => request(path, { ...o, method: 'GET' }),
    post: (path, json, o) => request(path, { ...o, method: 'POST', json }),
    put: (path, json, o) => request(path, { ...o, method: 'PUT', json }),
    patch: (path, json, o) => request(path, { ...o, method: 'PATCH', json }),
    delete: (path, o) => request(path, { ...o, method: 'DELETE' }),
  };
}

/** Exchanges a refresh token for a new token pair (mobile, or a server-side BFF route). */
export async function refreshTokens(
  baseUrl: string,
  refreshToken: string,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<AuthResponse> {
  const res = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw await toError(res);
  return (await res.json()) as AuthResponse;
}

async function toError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === 'object' && 'code' in parsed) body = parsed as ApiErrorBody;
  } catch {
    // not JSON (proxy error page, empty body)
  }
  return new ApiError(
    res.status,
    body?.code ?? `HTTP_${res.status}`,
    body?.message ?? (res.statusText || 'Request failed'),
    body,
  );
}
