## What changed

<!-- One or two sentences. Link the task/issue if there is one. -->

## Checklist

- [ ] Targets `dev` (only `dev` or `hotfix/*` may target `main`)
- [ ] `npm run lint && npm run typecheck && npm test` pass locally
- [ ] Uses only API endpoints already released to the backend's `dev` environment
- [ ] Mobile: JS-only change (OTA update is enough) / needs a new native build (say why)
- [ ] No secrets, keys or `.env` files committed
- [ ] Screenshots or a short recording attached for UI changes (web and/or mobile)
