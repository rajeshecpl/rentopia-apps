# apps/

Each folder here is one application and one npm workspace. Create them from the **repository root** with the commands below. Install dependencies **at the root only** (`npm install`), so there is a single `package-lock.json`.

| Folder | What | Stack |
|---|---|---|
| `customer-web` | Public customer website (SEO) | Next.js, App Router, TypeScript, Tailwind |
| `vendor-dashboard` | Vendor portal: listings, pricing, availability, bookings, earnings | Vite + React + TypeScript |
| `admin-dashboard` | Operations: approvals, moderation, bookings, refunds, reports | Vite + React + TypeScript |
| `customer-app` | Customer mobile app (iOS + Android) | Expo (React Native + TypeScript) |

## Create the apps

```bash
# Website (skip its own install; the root install handles it)
npx create-next-app@latest apps/customer-web --ts --eslint --tailwind --app --src-dir --use-npm --skip-install

# Dashboards
npm create vite@latest apps/vendor-dashboard -- --template react-ts
npm create vite@latest apps/admin-dashboard -- --template react-ts

# Mobile
npx create-expo-app@latest apps/customer-app --template default --no-install

# Then, from the root:
npm install
```

If a generator still creates a `package-lock.json` or `node_modules` inside an app folder, delete them and run `npm install` at the root.

## Wire each app into the workspace

1. **Unique package name** in each app's `package.json`: `"name": "customer-web"`, `"vendor-dashboard"`, `"admin-dashboard"`, `"customer-app"`.
2. **Use the shared client:** add `"@rentopia/api-client": "*"` to the app's `dependencies`, then run `npm install` at the root.
3. **Scripts CI expects.** CI runs these in every workspace and skips any that are missing:
   ```json
   "lint": "eslint .",
   "typecheck": "tsc --noEmit",
   "test": "vitest run --passWithNoTests",
   "build": "next build"
   ```
   - For the dashboards, use `"build": "vite build"`.
   - For the Expo app, skip `build`; mobile builds go through EAS.
   - Expo templates use Jest instead of Vitest: `"test": "jest --passWithNoTests"`.
4. **Environment variables:** commit a `.env.example` in each app. Real `.env*` files are git-ignored.

   | App | Variables |
   |---|---|
   | customer-web | `API_URL`, `NEXT_PUBLIC_API_URL` |
   | dashboards | `VITE_API_URL` |
   | customer-app | `EXPO_PUBLIC_API_URL` (per EAS profile in `eas.json`) |

5. **Next.js only:** add `transpilePackages: ['@rentopia/api-client']` to `next.config.ts`.

Run one app: `npm run dev -w customer-web` (or `-w vendor-dashboard`, `-w admin-dashboard`, `-w customer-app` for `npx expo start`).

How each app should talk to the API: [docs/FRONTEND_AND_MOBILE.md](../docs/FRONTEND_AND_MOBILE.md).
