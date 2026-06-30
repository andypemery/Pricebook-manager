# Historical Build Check Results

These notes record earlier release checks. Current platform guidance is in `README_DEPLOYMENT.md`.

## v1.0.8 Build Check Results

Controlled patch update from v1.0.7 to v1.0.8 for the configurable outbound email provider layer.

## Checks run in this sandbox

- `npm install --ignore-scripts` - passed, with Node engine warning because this sandbox ran Node 22 while the app then pinned Node 20.x for Vercel.
- `npm run lint` - passed.
- `npm test` - passed: 1 test file, 3 tests.
- `npm audit --audit-level=high` - failed because existing dependency tree reports vulnerabilities, mostly in dev tooling and Next/PostCSS transitive dependencies. I did not run `npm audit fix --force` because it proposes breaking major dependency changes.
- `npm audit --omit=dev --audit-level=high` - no high/critical production-only issues reported, but moderate Next/PostCSS transitive advisory remains.

## Checks attempted but not passed locally

- `npx prisma validate` - attempted but blocked because this sandbox cannot reach `binaries.prisma.sh`.
- `npx prisma generate` - attempted but blocked because this sandbox cannot reach `binaries.prisma.sh`.
- `npm run typecheck` - attempted, but local typecheck cannot complete because Prisma Client could not be regenerated in this sandbox after schema changes.
- `npm run build` - attempted. Next.js compilation completed, but final type checking failed because local Prisma Client generation was blocked and the generated client did not include the schema types.

## Important deployment note

Vercel should run the standard build command first:

Historical command at the time:

`npx prisma generate && npx prisma db push && npx tsx prisma/setup-production.ts && npm run build`

Your previous Vercel logs show Vercel can reach Prisma binaries and generate the client, so the local sandbox limitation should not apply on Vercel.

## v1.0.8 deployment hotfix - 2026-06-23

### Issue fixed

Vercel generated Prisma Client successfully, then failed during Next.js type checking because `lib/actions/email.actions.ts` built an email provider `data` object with `status` inferred as a plain `string`. Prisma expects the generated `EmailConnectionStatus` enum for `EmailProviderSetting.status`.

### Patch applied

- Imported `EmailConnectionStatus` from `@prisma/client`.
- Changed the reusable email settings data object to use `EmailConnectionStatus.CONFIGURED`.
- Changed disconnect/fallback update paths to use `EmailConnectionStatus.DISCONNECTED` and `EmailConnectionStatus.DISABLED`.
- Changed Axiom fallback mode updates to use `EmailProviderMode.AXIOM` rather than a plain string.

### Checks run after the hotfix

- `npm install --ignore-scripts` - passed, with Node engine warning because this sandbox ran Node 22 while the app then pinned Node 20.x for Vercel.
- `npm run lint` - passed.
- `npm test` - passed: 1 test file, 3 tests.
- `npm audit --audit-level=high` - failed because the existing dependency tree reports vulnerabilities and the proposed automatic fixes require breaking dependency changes.

### Checks attempted but still blocked locally

- `npx prisma validate` - attempted but blocked because this sandbox cannot reach `binaries.prisma.sh`.
- `npx prisma generate --no-engine` - attempted but still blocked by the Prisma engine download check in this sandbox.
- `npm run typecheck` - attempted, but failed locally because Prisma Client could not be regenerated after `npm install --ignore-scripts`, so `@prisma/client` did not expose generated schema enums/types.
- `npm run build` - attempted. Next.js compiled successfully, then failed at type-check stage for the same local generated Prisma Client limitation.

### Vercel expectation

Your Vercel log showed `npx prisma generate` completed successfully before `npm run build`, so this hotfix targets the real Vercel TypeScript error rather than the local sandbox Prisma-download limitation.

## v1.0.9 Security and GDPR hardening checks - 2026-06-27

- `npm install` - passed.
- `npx prisma generate` - passed.
- `npm run lint` - passed.
- `npm run typecheck` - passed.
- `npm test` - passed: 1 test file, 3 tests.
- `npm run build` - passed.
- `npm audit --audit-level=high` - failed on existing dependency advisories. The reported automatic fixes require breaking upgrades, so `npm audit fix --force` was not run.
