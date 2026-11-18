# RENTOPIA Apps

[![ci](https://github.com/rajeshecpl/rentopia-apps/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/rajeshecpl/rentopia-apps/actions/workflows/ci.yml)

Client applications for RENTOPIA, a multi-vendor rental marketplace for properties, rooms, hostels/PGs, cars and bikes:

- **customer-web**: Next.js customer website
- **vendor-dashboard** and **admin-dashboard**: Vite + React portals
- **customer-app**: Expo (React Native) app for iOS and Android

All of them use the shared **`@rentopia/api-client`** package to talk to the API in the **[rentopia-backend](https://github.com/rajeshecpl/rentopia-backend)** repository.

```
apps/                    the applications (scaffold them using apps/README.md)
packages/api-client/     shared TypeScript types + API client (auth, token refresh, errors)
docs/                    integration guide and CI/CD setup
.github/workflows/       CI for all workspaces, EAS updates for the mobile app
```

> Status: workspace skeleton. The shared API client is implemented and tested; the four apps have not been generated yet.

## Requirements

- Node.js 22 (see `.nvmrc`; 20 also works for now)
- The backend running locally or a deployed dev API

## Commands (from the repository root)

```bash
npm install            # installs every workspace; one lockfile at the root
npm run lint           # all workspaces
npm run typecheck
npm test
npm run build
npm run api:types      # regenerate API types from the backend's OpenAPI (API_URL=... to target dev)
```

Run one app: `npm run dev -w customer-web`

## Branches

`dev` is the development environment and `main` is production. Work on a feature branch, open a PR into `dev`, and release with a PR `dev → main`. Details, hosting and EAS setup: [docs/CI_CD.md](docs/CI_CD.md).

## Docs

- [docs/FRONTEND_AND_MOBILE.md](docs/FRONTEND_AND_MOBILE.md): how each app authenticates and calls the API
- [apps/README.md](apps/README.md): creating and wiring up the apps
- [docs/CI_CD.md](docs/CI_CD.md): CI, deployments, GitHub settings
- API contract: `docs/API_CLIENTS.md` in rentopia-backend
