# CI/CD: dev and production

## How code moves

```
feature branch ──PR──▶ dev ──▶ DEV  (dev website/dashboards, EAS "preview" channel, dev API)
                        │
                        └──PR (only from dev or hotfix/*)──▶ main ──▶ PRODUCTION
```

| Workflow | When | What |
|---|---|---|
| `ci.yml` → check **apps-ci** | every PR into `dev`/`main`, every push to them | `npm ci`, then lint, typecheck, test and build in every workspace |
| `branch-policy.yml` → check **branch-policy** | PRs into `main` | fails unless the PR comes from `dev` or `hotfix/*` |
| `mobile-update.yml` | push to `dev`/`main` touching the mobile app or shared packages | runs CI, then `eas update` to channel `preview` (dev) or `production` (main). Skips itself until the app exists and `EXPO_TOKEN` is set |
| `../dependabot.yml` | weekly | npm and Actions updates as PRs into `dev` |

The website and dashboards are **deployed by the hosting service**, which watches the branches, not by GitHub Actions. The `apps-ci` check guarantees nothing broken reaches `dev` or `main`.

## One-time GitHub setup

1. **Default branch:** create `dev` and push it, then Settings → General → Default branch → `dev`.
2. **Environments** (Settings → Environments):
   - `dev`: secret `EXPO_TOKEN`, variable `API_URL` = the dev API URL.
   - `production`: secret `EXPO_TOKEN`, variable `API_URL` = the production API URL. Restrict deployment branches to `main`.
   - Optional: required reviewers. On a **private** repo this needs a paid GitHub plan.
3. **Repository variable** (Settings → Secrets and variables → Actions → Variables): `DEV_API_URL`, used only as the build-time URL in CI. It can stay unset until the dev API exists.
4. **Rulesets** for `dev` and `main`: require a PR, require the status check `apps-ci` (plus `branch-policy` on `main`), block force pushes and deletion, and require 1 approval on `main`. Checks only appear in the picker after they have run once.

`EXPO_TOKEN`: expo.dev → Account settings → Access tokens.

## Hosting the web apps

### Customer website (Next.js)
**Vercel** (simplest):
- New Project → import `rentopia-apps` → Root Directory `apps/customer-web`.
- Settings → Git: Production Branch = `main`. Every other branch, including `dev`, gets a preview deployment. Give `dev` a fixed domain (Settings → Domains → assign e.g. `dev.rentopia.in` to the `dev` branch).
- Environment variables: `API_URL` and `NEXT_PUBLIC_API_URL`, with the production API for *Production* and the dev API for *Preview*.

**AWS Amplify Hosting** (keeps everything in AWS):
- Connect the repo with the monorepo app root `apps/customer-web`.
- Add the branches `main` (production) and `dev`, with environment variables per branch.

### Dashboards (Vite)
Static builds (`vite build` → `dist/`). Use a second and third Vercel/Amplify project with root `apps/vendor-dashboard` / `apps/admin-dashboard`, or S3 + CloudFront. The env var is `VITE_API_URL`.

After any new domain: add it to `CORS_ALLOWED_ORIGINS` in the matching backend environment.

## Mobile releases

| What changed | How it ships |
|---|---|
| JS/TS code, styles, images | automatic: `mobile-update.yml` runs `eas update` on merge (`dev` → testers on `preview`, `main` → users on `production`) |
| Native code, new native libraries, `app.json` native settings, SDK upgrade | new binary: `eas build --profile preview` (testers) or `eas build --profile production` then `eas submit` (stores) |

Set up once inside `apps/customer-app`:
1. `npx eas-cli login`
2. `npx eas-cli init` (links the Expo project)
3. `npx eas-cli update:configure`
4. Create the `eas.json` profiles from [FRONTEND_AND_MOBILE.md](FRONTEND_AND_MOBILE.md).

## Working with the backend

- **Backend first:** a screen that needs a new endpoint is merged here only after that endpoint is on the backend's `dev`. Production releases follow the same order: backend `main` first, then apps `main`.
- Mobile users don't update instantly, so older app versions keep calling the API. The backend keeps `/api/v1` changes additive; the apps must ignore unknown fields.
- When the backend adds endpoints, run `npm run api:types` and update `packages/api-client` in the same PR as the screens that use them.

## Hotfixes

Branch `hotfix/<name>` from `main` and open a PR into `main`. After release, merge `main` back into `dev`.
