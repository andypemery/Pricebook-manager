# Environment Variables

Use placeholders in documentation and examples. Do not commit real secrets, tokens, passwords, API keys or database URLs.

## Required Core Variables

```text
DATABASE_URL
SESSION_SECRET
CRON_SECRET
APP_URL
AXIOM_ADMIN_EMAIL
AXIOM_ADMIN_TEMP_PASSWORD
```

`APP_URL` must be the stable production HTTPS customer-facing URL. Real production deployments reject missing `APP_URL` and insecure `http://` values.

Vercel also provides `VERCEL_ENV` and `VERCEL_URL`. The app uses them only to distinguish production, preview and development deployments:

- `VERCEL_ENV=production`: `APP_URL` is required and must start with `https://`.
- `VERCEL_ENV=preview`: if `APP_URL` is missing, preview-only links may temporarily use `https://${VERCEL_URL}`.
- `VERCEL_ENV=development`: local/development behaviour is allowed.

Local development may use `http://localhost:3000`. Customer handover and production-generated links must never use a Vercel preview URL.

## Axiom Email Notifications

```text
AXIOM_EMAIL_MODE
AXIOM_EMAIL_FROM
AXIOM_EMAIL_REPLY_TO
AXIOM_EMAIL_DISPLAY_NAME
EMAIL_SECRET
SUPPORT_EMAIL
AXIOM_SUPPORT_EMAIL
NOTIFICATIONS_FROM_EMAIL
NOTIFICATIONS_REPLY_TO_EMAIL
NOTIFICATIONS_FROM_NAME
INVITES_FROM_EMAIL
SECURITY_FROM_EMAIL
```

Safe defaults are pre-filled by the base app for non-secret values:

```text
AXIOM_ADMIN_EMAIL=Andy.Emery@axiomps.co.uk
AXIOM_EMAIL_FROM=notifications@axiomps.co.uk
AXIOM_EMAIL_REPLY_TO=notifications@axiomps.co.uk
AXIOM_EMAIL_DISPLAY_NAME=Axiom Notifications
SUPPORT_EMAIL=notifications@axiomps.co.uk
AXIOM_SUPPORT_EMAIL=notifications@axiomps.co.uk
```

Secrets and live environment values must still be supplied in Vercel: `DATABASE_URL`, `SESSION_SECRET`, `CRON_SECRET`, `AXIOM_ADMIN_TEMP_PASSWORD`, `EMAIL_SECRET`, email-provider credentials, storage tokens and hub/API tokens.

When `AXIOM_EMAIL_MODE=smtp`, configure:

```text
SMTP_HOST
SMTP_PORT
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
SMTP_REPLY_TO
SMTP_SECURE
```

When `AXIOM_EMAIL_MODE=graph`, configure:

```text
MICROSOFT_TENANT_ID
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_SENDER_USER_ID
MICROSOFT_SENDER_EMAIL
```

Customer Microsoft 365 and Gmail provider connection screens are optional/scaffolded. Customers do not need to configure them for Axiom Email Notifications.

## Optional Axiom Ops Hub

```text
AXIOM_OPS_HUB_API_URL
AXIOM_OPS_HUB_API_KEY
AXIOM_APP_ID
AXIOM_CUSTOMER_ID
AXIOM_HUB_URL
AXIOM_HUB_SHARED_SECRET
```

## Optional Vercel / Blob Storage

```text
VERCEL_PROJECT_ID
VERCEL_TEAM_ID
VERCEL_API_TOKEN
BLOB_READ_WRITE_TOKEN
```

Private file upload/download remains framework-only unless storage is deliberately wired and tested.

## MFA

Email-code MFA is database-backed and user-specific through the `MfaChallenge` table. There is no separate MFA secret in the current implementation. Configure `SESSION_SECRET`, `EMAIL_SECRET` and the selected email provider before enabling `mfaRequired` for users.
