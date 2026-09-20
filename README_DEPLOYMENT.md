# Deployment Guide

## Before deploying

Make sure the project has these Vercel environment variables before the build runs:

```text
DATABASE_URL
SESSION_SECRET
CRON_SECRET
AXIOM_ADMIN_EMAIL
AXIOM_ADMIN_TEMP_PASSWORD
APP_URL
```

`DATABASE_URL` must be the full Neon/Postgres connection string, starting with `postgresql://` or `postgres://`.
`APP_URL` must be the stable production HTTPS customer-facing URL. Real production deployments fail if `APP_URL` is missing or does not start with `https://`.

Vercel preview deployments may omit `APP_URL`; when `VERCEL_ENV=preview` and `VERCEL_URL` is present, generated links can temporarily use `https://${VERCEL_URL}` for preview testing only. Do not use a Vercel preview URL for customer handover or production links.

Local development may use `http://localhost:3000`.

Vercel Sensitive values are write-only from the local release workflow. Never use `vercel env pull` or `vercel env run` to read or reveal them, and never rotate a value merely because it appears blank locally. Vercel injects the configured values during builds and at runtime. Database migration work must use a direct, non-pooled connection obtained from Neon after positively identifying the exact project and branch.

## New App Setup Checklist

1. Create the GitHub repository from the Standard Base App template.
2. Create the Vercel project and confirm Node 24.x is used.
3. Add environment variables from `.env.example`.
4. Connect the database and confirm `DATABASE_URL`.
5. Establish Prisma migration history through the authorised migration process before deploying the application. For the legacy Production database, follow `PRODUCTION_MIGRATION_BOOTSTRAP.md`; do not improvise a baseline.
6. Confirm `vercel.json` invokes only `npm run vercel-build`.
7. Run approved migrations manually with `npm run db:migrate:deploy` using the verified direct Neon connection, then require `npm run db:check-migrations` to pass.
8. Deploy so Vercel verifies migration state, runs application setup/defaults, and builds the application.
9. Log in as the Axiom Admin user.
10. Confirm the forced password change flow completes.
11. Test email sending from the email settings screen.
12. Test MFA login after enabling MFA for a test user, or confirm MFA remains disabled for initial setup.
13. Complete the release gate checks: install, Prisma generate/validate, lint, typecheck, tests and build.

Pre-filled non-secret values:

```text
AXIOM_ADMIN_EMAIL=Andy.Emery@axiomps.co.uk
AXIOM_EMAIL_FROM=notifications@axiomps.co.uk
AXIOM_EMAIL_REPLY_TO=notifications@axiomps.co.uk
AXIOM_EMAIL_DISPLAY_NAME=Axiom Notifications
SUPPORT_EMAIL=notifications@axiomps.co.uk
AXIOM_SUPPORT_EMAIL=notifications@axiomps.co.uk
```

Manual values still required:

```text
DATABASE_URL
SESSION_SECRET
CRON_SECRET
APP_URL
AXIOM_ADMIN_TEMP_PASSWORD
EMAIL_SECRET
SMTP_* or MICROSOFT_* provider credentials for live email
BLOB_STORE_ID if file storage is enabled; Vercel supplies temporary Blob credentials through OIDC
AXIOM_OPS_HUB_* / VERCEL_* tokens if those integrations are used
```

## First deployment steps

1. Open GitHub Desktop.
2. Use **Add local repository** and select the folder that contains `package.json`.
3. Commit and push to GitHub.
4. In Vercel, import the GitHub repository.
5. Keep Root Directory as `./`.
6. Connect or create Neon Postgres and positively identify the target Neon project and branch.
7. Add the required environment variables.
8. With a verified direct, non-pooled Neon connection, review and apply approved migrations manually, then run `npm run db:check-migrations`.
9. Deploy only after the migration check passes.
10. If deployment fails, open **Build Logs**, not Runtime Logs.
11. Log in with `AXIOM_ADMIN_EMAIL` and the password from `AXIOM_ADMIN_TEMP_PASSWORD`.
12. Change the password when prompted.

## Normal build command

The build command is stored in `vercel.json`:

```text
npm run vercel-build
```

`vercel-build` runs, in order: Prisma Client generation, the read-only migration-state gate, the established idempotent application setup/defaults step, then the Next.js build. It never applies migrations, repairs migration history, or changes schema. The ordinary `npm run build` remains database-free for local application builds.

## Database migration commands

- `npm run db:generate` generates Prisma Client and does not contact the database.
- `npm run db:check-migrations` reads local migration files and `_prisma_migrations`; it does not mutate the database.
- `npm run db:migrate:deploy` is the explicit schema-changing command. It is for an authorised release operator only, after verifying the exact Neon project/branch and reviewing the pending SQL. Vercel and application startup never invoke it.
- `npm run db:setup` performs idempotent application-data setup after the migration gate passes. It does not manage schema.
- `npm run vercel-build` is the Vercel-only orchestration command and does not apply schema changes.

The retired `prisma db push` workflow is prohibited for Shared Preview and Production. A missing history table, pending/failed/rolled-back migration, unknown database migration, ordering inconsistency, or checksum mismatch blocks the deployment before setup or build.

## Shared Preview and Production release workflow

For a feature with no migration:

1. Complete development validation and deploy the approved code to Shared Preview.
2. Let the Vercel read-only gate confirm that the database already matches the commit.
3. Complete manual acceptance and focused regression/typecheck/lint/build checks.
4. Integrate the approved SHA onto `main` and push `main` normally.
5. Let the Production build guard confirm that Production already matches the commit, then verify runtime health.

For a feature with a migration:

1. Before deploying code, identify the exact target Neon project, branch and database; obtain a direct, non-pooled connection from Neon without pulling Vercel secrets.
2. Inspect migration state and every pending `migration.sql`; confirm approval and a backup/restore point.
3. Run `npm run db:migrate:deploy` explicitly, verify database health, then require `npm run db:check-migrations` to pass.
4. Only then deploy the matching application commit. Repeat the same guarded sequence separately for Shared Preview and Production.

No Vercel deployment applies migrations. Production is complete only when the deployed SHA is contained in `origin/main`: verify the approved SHA, integrate and push `main`, allow or trigger the Production deployment from `main`, verify Vercel is READY, verify the deployed SHA matches the intended `origin/main`, and check database/runtime health. Never leave a detached or feature-only commit deployed to Production.

## Axiom Platform Health Check

Each base build should confirm:

- Node 24.x is configured in `package.json`, `.nvmrc`, `.node-version` and Vercel.
- Next.js is on a supported release.
- Prisma status has been reviewed and generation passes.
- ESLint is on a supported release and lint passes.
- `npm install` completes with no unresolved dependency warnings, or any warnings are documented.
- `npm audit --omit=dev` is clean.
- `npm run typecheck`, `npm test` and `npm run build` pass.
- Required environment variables are documented in `.env.example` and `ENVIRONMENT_VARIABLES.md`.
- The production setup script completes and confirms the Axiom Admin seed behaviour.
- Email settings defaults are present.
- Storage and backup settings are documented where used.

## Email setup

The app includes Axiom Email Notifications as the default sender and tenant-scoped sending profiles. Customers do not need to connect Microsoft 365, Gmail or SMTP for the default Axiom sender.

Live sending still requires Axiom deployment sender setup. If the sender backend is missing, the app shows "Needs Axiom setup" and does not pretend emails are sending.

Useful sender variables:

```text
AXIOM_EMAIL_MODE
AXIOM_EMAIL_FROM
AXIOM_EMAIL_REPLY_TO
AXIOM_EMAIL_DISPLAY_NAME
EMAIL_SECRET
SUPPORT_EMAIL
SMTP_HOST
SMTP_USER
SMTP_PASSWORD
MICROSOFT_TENANT_ID
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
```

## Security and release gate

Before handover, run:

```text
npm install
npm run db:generate
npx prisma validate
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Run `npm run db:check-migrations` only with an explicitly selected deployment database. Do not make an ordinary local build contact Shared Preview or Production.

Confirm the deployed Vercel/custom domain is HTTPS-enabled and that customer-facing password reset and invite links use the stable production `APP_URL`, not a Vercel preview URL.

HTTPS/TLS provides encryption in transit between the browser and the app server. This is not end-to-end encryption.

## Important base-app note

The **Demo Records** module exists only in the base app. Remove or replace it before creating a live customer app.
