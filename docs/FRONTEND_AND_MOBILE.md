# Building the apps against the RENTOPIA API

How the Next.js customer website, the two Vite dashboards and the Expo app use the API from the **rentopia-backend** repository. The API contract (endpoints, token rules, error codes) is in that repo's `docs/API_CLIENTS.md`; this guide is about the client side.

## 1. Workspace layout

```
rentopia-apps/
├── apps/
│   ├── customer-web/        Next.js (App Router, TypeScript, Tailwind) — public, SEO
│   ├── vendor-dashboard/    Vite + React + TypeScript
│   ├── admin-dashboard/     Vite + React + TypeScript
│   └── customer-app/        Expo (React Native + TypeScript)
└── packages/
    └── api-client/          @rentopia/api-client — types + fetch client used by all four
```

npm workspaces: there is **one** `package-lock.json` at the root, and `npm install` always runs at the root. Scaffold commands are in [apps/README.md](../apps/README.md).

## 2. The shared client: `@rentopia/api-client`

```ts
import { createApiClient, rentopiaApi, ApiError } from '@rentopia/api-client';

const client = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,      // per app, see below
  getAccessToken: () => accessToken,              // from memory / secure storage
  refreshAccessToken: async () => { /* platform-specific, returns new access token or null */ },
  onSessionExpired: () => { /* clear state, go to login */ },
});
export const api = rentopiaApi(client);

// usage
const profile = await api.users.getProfile();
try {
  await api.auth.register(form);
} catch (e) {
  if (e instanceof ApiError && e.code === 'EMAIL_TAKEN') { /* show message */ }
  if (e instanceof ApiError) setFieldError('email', e.fieldError('email'));
}
```

What it handles for every app:
- adds `Authorization: Bearer …` (except calls marked `{ auth: false }`);
- on 401, refreshes **once** and retries **once**. Parallel 401s share one refresh, which matters because the API logs the user out everywhere if a refresh token is used twice;
- turns every failure into an `ApiError` with `status`, `code` and `fieldError(name)`. Network failures become `status 0`, code `NETWORK_ERROR`.

The only platform-specific part is **where tokens live and how refresh is done**.

As the backend adds endpoints, add typed wrappers in `packages/api-client/src/endpoints.ts`, or generate all types from OpenAPI:

```bash
npm run api:types                                     # local API on :8080
API_URL=https://api-dev.rentopia.in npm run api:types # or the dev API
```

## 3. Customer website (Next.js)

**Tokens:**
- The **refresh token** stays in an **httpOnly cookie**, set by Next.js route handlers (a small backend-for-frontend), so browser JavaScript and any XSS can never read it.
- The **access token** lives in memory (React context) and is fetched again via refresh on page load.

```
browser ─▶ /api/auth/login   (Next route) ─▶ API /auth/login     sets cookie "rt", returns accessToken + user
browser ─▶ API /api/v1/...   with Bearer accessToken             (CORS: the site's origin must be allowed)
browser ─▶ /api/auth/refresh (Next route) ─▶ API /auth/refresh   reads + rotates the cookie
browser ─▶ /api/auth/logout  (Next route) ─▶ API /auth/logout    deletes the cookie
```

`apps/customer-web/src/app/api/auth/login/route.ts`
```ts
import { NextResponse } from 'next/server';
import { createApiClient, rentopiaApi, ApiError } from '@rentopia/api-client';

const server = rentopiaApi(createApiClient({
  baseUrl: process.env.API_URL!, getAccessToken: () => null, refreshAccessToken: async () => null,
}));

export async function POST(req: Request) {
  try {
    const { refreshToken, ...rest } = await server.auth.login(await req.json());
    const res = NextResponse.json(rest);
    res.cookies.set('rt', refreshToken, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth', maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json(e.body ?? { code: e.code }, { status: e.status || 502 });
    throw e;
  }
}
```

`apps/customer-web/src/app/api/auth/refresh/route.ts`
```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { refreshTokens, ApiError } from '@rentopia/api-client';

export async function POST() {
  const rt = (await cookies()).get('rt')?.value;
  if (!rt) return NextResponse.json({ code: 'UNAUTHORIZED' }, { status: 401 });
  try {
    const { refreshToken, accessToken, user } = await refreshTokens(process.env.API_URL!, rt);
    const res = NextResponse.json({ accessToken, user });
    res.cookies.set('rt', refreshToken, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth', maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (e) {
    const res = NextResponse.json({ code: e instanceof ApiError ? e.code : 'UNAUTHORIZED' }, { status: 401 });
    res.cookies.delete({ name: 'rt', path: '/api/auth' });
    return res;
  }
}
```
Register mirrors login. Logout posts the cookie's token to `/auth/logout` and deletes the cookie.

`apps/customer-web/src/lib/api.ts` (browser side)
```ts
import { createApiClient, rentopiaApi } from '@rentopia/api-client';

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };

export const api = rentopiaApi(createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!,
  getAccessToken: () => accessToken,
  refreshAccessToken: async () => {
    const r = await fetch('/api/auth/refresh', { method: 'POST' });
    accessToken = r.ok ? (await r.json()).accessToken : null;
    return accessToken;
  },
  onSessionExpired: () => { accessToken = null; window.location.assign('/login'); },
}));
```

Other setup:
- `next.config.ts`: add `transpilePackages: ['@rentopia/api-client']`, because the package ships TypeScript source.
- Data fetching: TanStack Query on the client. Public pages (listing search and details) use **server components** with `fetch(..., { next: { revalidate: 60 } })` and no token, so search engines see full HTML.
- Environment variables: `API_URL` (server routes) and `NEXT_PUBLIC_API_URL` (browser), the same value per environment.
- The site's origin must be in the backend's `CORS_ALLOWED_ORIGINS` for that environment. `http://localhost:3000` is allowed by default.

## 4. Vendor and admin dashboards (Vite)

Internal tools with no SEO, so there's no backend-for-frontend:

```ts
import { createApiClient, rentopiaApi, refreshTokens } from '@rentopia/api-client';
const API_URL = import.meta.env.VITE_API_URL;

export const api = rentopiaApi(createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => sessionStorage.getItem('at'),
  refreshAccessToken: async () => {
    const rt = sessionStorage.getItem('rt');
    if (!rt) return null;
    const t = await refreshTokens(API_URL, rt);
    sessionStorage.setItem('at', t.accessToken);
    sessionStorage.setItem('rt', t.refreshToken);
    return t.accessToken;
  },
  onSessionExpired: () => { sessionStorage.clear(); location.assign('/login'); },
}));
```
- `sessionStorage` is cleared when the tab closes, which suits staff tools.
- Show screens by `user.roles` (VENDOR, ADMIN, SUPPORT). The API enforces access itself.
- `http://localhost:5173` is allowed by CORS. Run the second dashboard on another port and add that origin to the backend's `CORS_ALLOWED_ORIGINS` in `application-local.yml`.

## 5. Customer app (Expo / React Native)

```bash
cd apps/customer-app && npx expo install expo-secure-store
```

`apps/customer-app/src/lib/api.ts`
```ts
import * as SecureStore from 'expo-secure-store';
import { createApiClient, rentopiaApi, refreshTokens, type AuthResponse } from '@rentopia/api-client';

const API_URL = process.env.EXPO_PUBLIC_API_URL!;
const AT = 'rentopia.at', RT = 'rentopia.rt';

export async function saveSession(t: Pick<AuthResponse, 'accessToken' | 'refreshToken'>) {
  await SecureStore.setItemAsync(AT, t.accessToken);
  await SecureStore.setItemAsync(RT, t.refreshToken);
}
export async function clearSession() {
  await SecureStore.deleteItemAsync(AT);
  await SecureStore.deleteItemAsync(RT);
}

export const api = rentopiaApi(createApiClient({
  baseUrl: API_URL,
  getAccessToken: () => SecureStore.getItemAsync(AT),
  refreshAccessToken: async () => {
    const rt = await SecureStore.getItemAsync(RT);
    if (!rt) return null;
    const t = await refreshTokens(API_URL, rt);
    await saveSession(t);
    return t.accessToken;
  },
  onSessionExpired: () => { void clearSession(); /* navigate to the login screen */ },
}));
```

Login: `const t = await api.auth.login({ email, password }); await saveSession(t);`

- **Storage:** `expo-secure-store` uses the Keychain on iOS and the Keystore on Android. Never store tokens in AsyncStorage.
- **Monorepo:** Expo SDK 52+ detects npm workspaces automatically. If Metro can't resolve `@rentopia/api-client`, see Expo's "Work with monorepos" guide.
- **Local API from a device:**
  - Android emulator: `http://10.0.2.2:8080`.
  - iOS simulator: `http://localhost:8080`.
  - Real phone: `http://<your-PC-LAN-IP>:8080`, on the same Wi-Fi.
  - Plain HTTP is for development builds only.
- **CORS** doesn't apply to native apps.

`apps/customer-app/eas.json`
```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal",
                     "env": { "EXPO_PUBLIC_API_URL": "http://10.0.2.2:8080" } },
    "preview":     { "distribution": "internal", "channel": "preview",
                     "env": { "EXPO_PUBLIC_API_URL": "https://api-dev.rentopia.in" } },
    "production":  { "channel": "production",
                     "env": { "EXPO_PUBLIC_API_URL": "https://api.rentopia.in" } }
  }
}
```

## 6. Branch → environment

| Branch | API used | Customer web | Dashboards | Mobile |
|---|---|---|---|---|
| `dev` | dev API | dev deployment (Vercel preview / Amplify branch `dev`) | dev deployment | EAS Update channel `preview` → internal tester builds |
| `main` | production API | production site | production deployment | EAS Update channel `production` → store builds |

CI and hosting setup for this repo: [CI_CD.md](CI_CD.md).

## 7. Suggested order

1. Scaffold `apps/customer-web` (see [apps/README.md](../apps/README.md)), add the three auth routes and `lib/api.ts`, and build login, register and profile against your local API (`docker compose up -d` + `mvnw spring-boot:run -Dspring-boot.run.profiles=local` in the backend repo).
2. Connect hosting for `dev`/`main`, and add the site's domains to the backend's CORS settings.
3. Scaffold `apps/customer-app` with the same screens, then add `eas.json` and the `EXPO_TOKEN` secret.
4. Dashboards once the vendor-onboarding and admin APIs land.
5. For each backend milestone (listings, booking, payments): regenerate types and add endpoints to `api-client` first, then the screens.
