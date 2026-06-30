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

## New App Setup Checklist

1. Create the GitHub repository from the Standard Base App template.
2. Create the Vercel project and confirm Node 24.x is used.
3. Add environment variables from `.env.example`.
4. Connect the database and confirm `DATABASE_URL`.
5. Confirm the build command in `vercel.json`.
6. Deploy or run the setup command so Prisma db push, Prisma generate and `prisma/setup-production.ts` run.
7. Log in as the Axiom Admin user.
8. Confirm the forced password change flow completes.
9. Test email sending from the email settings screen.
10. Test MFA login after enabling MFA for a test user, or confirm MFA remains disabled for initial setup.
11. Complete the release gate checks: install, Prisma generate, lint, typecheck, tests and build.

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
BLOB_READ_WRITE_TOKEN if file storage is enabled
AXIOM_OPS_HUB_* / VERCEL_* tokens if those integrations are used
```

## First deployment steps

1. Open GitHub Desktop.
2. Use **Add local repository** and select the folder that contains `package.json`.
3. Commit and push to GitHub.
4. In Vercel, import the GitHub repository.
5. Keep Root Directory as `./`.
6. Connect or create Neon Postgres.
7. Add the required environment variables.
8. Deploy.
9. If deployment fails, open **Build Logs**, not Runtime Logs.
10. Log in with `AXIOM_ADMIN_EMAIL` and the password from `AXIOM_ADMIN_TEMP_PASSWORD`.
11. Change the password when prompted.

## Normal build command

The build command is stored in `vercel.json`:

```text
npx prisma db push --skip-generate && npx prisma generate && npx tsx prisma/setup-production.ts && npm run build
```

`prisma db push --skip-generate` keeps the database sync step from generating Prisma Client, then the next command generates the client once before the setup script imports it.

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
npx prisma generate
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Confirm the deployed Vercel/custom domain is HTTPS-enabled and that customer-facing password reset and invite links use the stable production `APP_URL`, not a Vercel preview URL.

HTTPS/TLS provides encryption in transit between the browser and the app server. This is not end-to-end encryption.

## Important base-app note

The **Demo Records** module exists only in the base app. Remove or replace it before creating a live customer app.
