# v1.0.8 Controlled Update Notes

## Change summary

Added a reusable outbound email provider layer to the existing Axiom Standard Base App v1.0.7. This is a patch-style update, not a rebuild.

## Existing functionality preserved

The update was designed to preserve v1.0.7 login, forced password change, Axiom Admin access, Customer Admin access, user import, role templates, Account area, support tickets, feature requests, security issue reporting, audit log, backup status, global messages, branding, themes, deployment settings and existing app structure.

## Files changed or added

Changed:
- `package.json`
- `package-lock.json`
- `prisma/schema.prisma`
- `lib/email.ts`
- `app/(app)/account/page.tsx`
- `app/(app)/axiom-admin/diagnostics/page.tsx`
- `app/globals.css`
- `CHANGELOG.md`
- `ENVIRONMENT_VARIABLES.md`
- `.env.example`
- `BUILD_CHECK_RESULTS.md`

Added:
- `lib/actions/email.actions.ts`
- `components/email-settings-form.tsx`
- `app/(app)/account/email-settings/page.tsx`
- `app/(app)/axiom-admin/email-settings/page.tsx`
- `EMAIL_PROVIDER_LAYER.md`
- `CONTROLLED_UPDATE_NOTES_v1.0.8.md`

## Database/schema changes

Additive only:
- Added `EmailProviderMode` enum.
- Added `EmailConnectionStatus` enum.
- Added `EmailProviderSetting` model.
- Added `EmailSendLog` model.
- Added Tenant/User relations for email settings and send logs.

No existing models were removed or renamed.

## Environment variables added

- `AXIOM_EMAIL_MODE`
- `AXIOM_EMAIL_FROM`
- `AXIOM_EMAIL_REPLY_TO`
- `AXIOM_EMAIL_DISPLAY_NAME`
- `EMAIL_SECRET`
- `MICROSOFT_TENANT_ID`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_SENDER_USER_ID`
- `MICROSOFT_SENDER_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `SMTP_REPLY_TO`
- `SMTP_SECURE`

Existing email variables are still supported where practical, including `NOTIFICATIONS_FROM_EMAIL`, `NOTIFICATIONS_FROM_NAME`, `NOTIFICATIONS_REPLY_TO_EMAIL`, `SUPPORT_EMAIL`, and SMTP variables already present.

## Manual test script

1. Confirm existing login still works.
2. Confirm Axiom Admin still logs in and sees Axiom Admin routes.
3. Confirm Account page still opens.
4. Confirm Users & Permissions, user import and role templates still open.
5. Open Account → Email Settings as a permitted Admin user.
6. Confirm Axiom sender is the default mode.
7. Configure Axiom sender env vars and send a test email.
8. Switch to SMTP mode, enter SMTP settings, save, then send a test email.
9. Switch to Microsoft 365 mode, enter Graph app-level details where available, save, then send a test email.
10. Confirm saved secrets are not shown back in the UI.
11. Confirm failed sends show a safe error message.
12. Confirm EmailSendLog records are created.
13. Confirm audit log entries are created for provider changes and test sends.
14. As Axiom Admin, open Axiom Admin → Email provider overview.
15. Confirm provider status is visible and fallback can be forced.

## Known warnings

- Microsoft delegated OAuth/admin-consent browser flow is scaffolded in the design through the provider model and settings screen, but a full Microsoft OAuth callback flow is not completed in this patch. App-level Microsoft Graph sending is implemented for configured tenant/client/sender credentials.
- SMTP is implemented using Node socket/TLS support without adding a new mail dependency.
- Local Prisma validate/generate/build could not complete in this sandbox because Prisma engine download was blocked.

## Deployment hotfix note - 2026-06-23

Vercel build failed after Prisma Client generation because `EmailProviderSetting.status` was inferred as `string` in `lib/actions/email.actions.ts`. The hotfix keeps the existing v1.0.8 functionality and changes the email provider action code to use Prisma enum constants for email connection status and provider mode.

No database schema change was made for this hotfix.
