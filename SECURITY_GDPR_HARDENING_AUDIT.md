# Security and GDPR Hardening Audit

Date: 2026-06-27

Scope: Axiom Standard Base App current `main` baseline, updated on branch `codex/security-gdpr-hardening`.

This audit uses the requested status labels: Present and working, Partially present, Missing, Not applicable, or Implemented in this update. The app is GDPR-aware and designed to support good practice; it is not a legal compliance guarantee.

| # | Item | Status | Files checked | Findings and changes |
|---|---|---|---|---|
| 1 | Admin MFA | Implemented in this update | `lib/actions/auth.actions.ts`, `app/(auth)/mfa/page.tsx`, `prisma/schema.prisma`, `lib/email.ts` | Previously a placeholder page only. Added email one-time-code MFA for Axiom Admin, Customer Admin and any user with `mfaRequired`. Codes expire after 10 minutes, are hashed, have failed-attempt limits and are audited. |
| 2 | Login lockout | Implemented in this update | `lib/actions/auth.actions.ts`, `prisma/schema.prisma` | Previously counted failures but did not enforce the requested rule. Now 5 failed attempts inside 5 minutes gives a 15-minute temporary lockout with generic errors and audit events. |
| 3 | Re-authentication for dangerous actions | Partially present | `lib/reauth.ts`, `lib/actions/admin.actions.ts`, `app/(app)/admin/customer-settings/page.tsx`, admin pages | Added a reusable password re-authentication helper and applied it to password policy changes. It is not yet wired across every future dangerous action because several destructive/export/restore actions remain framework-only. |
| 4 | Configurable password policy | Implemented in this update | `lib/password.ts`, `lib/password-policy.ts`, `lib/actions/auth.actions.ts`, `lib/actions/admin.actions.ts`, `app/(auth)/set-password/page.tsx`, `components/set-password-form.tsx` | Tenant policy existed but was not consistently loaded. Password change, reset and invite/set-password now use tenant policy normalised to the Axiom baseline. Invite set-password validation errors are now displayed visibly and do not silently clear the form. Policy changes are audited. |
| 5 | Password reset expiry | Implemented in this update | `lib/actions/auth.actions.ts` | Previously 7 days. Reset links now expire after 30 minutes. Invite links remain 24 hours. |
| 6 | Change-password flow | Implemented in this update | `app/(auth)/change-password/page.tsx`, `lib/actions/auth.actions.ts` | Previously asked for email. It now uses the authenticated session user and asks for current password, new password and confirmation. |
| 7 | User management controls | Partially present | `app/(app)/admin/users/*`, `lib/actions/admin.actions.ts` | Create, import and resend invite exist with server-side checks. Edit user, deactivate user, admin reset password and last-active Customer Admin protection are not complete. |
| 8 | Page-level and server-side permissions | Partially present | `lib/auth.ts`, `lib/permissions.ts`, pages/actions | Most restricted routes/actions check `requireUser`, `requireAxiomAdmin` or `hasPermission`. Some helper centralisation is still light and should be strengthened as modules grow. |
| 9 | Tenant isolation helpers | Partially present | `lib/auth.ts`, `lib/permissions.ts`, pages/actions | Most queries are tenant-scoped directly. Reusable tenant-scoped record helpers are still missing. |
| 10 | Data Rights module | Partially present | `app/(app)/admin/data-rights/page.tsx`, `prisma/schema.prisma` | Tenant-scoped list/filter layout exists. SAR export, erasure workflow, rectification log and deletion/anonymisation confirmation are framework-only. |
| 11 | Data Register / Data Map | Partially present | `app/(app)/admin/data-rights/page.tsx`, `prisma/schema.prisma` | `DataRegisterItem` model and read-only coverage table exist. Customer edit/review workflow and defaults need follow-up. |
| 12 | Privacy / Data Use Notice | Partially present | `prisma/schema.prisma` | Models exist for privacy notice and acknowledgements via global messages, but no full Customer Admin notice workflow is wired. |
| 13 | DPIA trigger checklist | Missing | Settings/GDPR pages, schema | No DPIA checklist screen or storage exists yet. |
| 14 | Breach / Security Incident Log | Partially present | `app/(app)/security-issue/page.tsx`, `lib/actions/support.actions.ts`, `prisma/schema.prisma` | Dedicated `SecurityIssue` records exist and are separate from support tickets. Breach fields such as ICO review, 72-hour deadline and action taken are not complete. |
| 15 | Safe email HTML escaping | Implemented in this update | `lib/html.ts`, `lib/actions/support.actions.ts`, `lib/actions/auth.actions.ts` | Support and security descriptions are escaped before insertion into HTML emails. Reset links are escaped. |
| 16 | File controls | Partially present | `config/storage.config.ts`, `app/(app)/admin/files/page.tsx`, file routes | File register metadata exists. Upload/download routes are not exposed as a full feature by default; storage is clearly framework/not configured. |
| 17 | Backup/restore status | Present and working | `app/(app)/admin/backup/page.tsx`, `BACKUP_RESTORE_NOTES.md` | Status page is Axiom Admin-only and clear that backup/restore is framework/status unless wired. |
| 18 | Email templates | Partially present | `lib/email.ts`, `prisma/schema.prisma`, action files | Template model and `sendTemplateEmail` exist. Security-critical emails still mostly use direct templates; required-variable protection needs follow-up. |
| 19 | `.env.example` completeness | Implemented in this update | `.env.example`, `ENVIRONMENT_VARIABLES.md` | `.env.example` now lists core, email, Ops Hub, Vercel and blob placeholders only. |
| 20 | Security headers | Implemented in this update | `next.config.mjs`, `SECURITY_NOTES.md` | CSP, referrer policy, permissions policy, nosniff, frame protection and HSTS are configured. |
| 21 | Encryption in transit / HTTPS | Implemented in this update | `next.config.mjs`, `lib/auth.ts`, `lib/app-url.ts`, `prisma/setup-production.ts`, docs | Real production uses `VERCEL_ENV=production` where available and rejects missing or non-HTTPS `APP_URL`. Preview may temporarily use `https://${VERCEL_URL}` when `APP_URL` is missing. Session/MFA cookies are Secure in production. HSTS is configured. No customer-facing `http://` links were found outside XML namespace constants and localhost development. |
| 22 | Release gate checks | Present | `package.json`, `README_DEPLOYMENT.md`, docs | Scripts exist for lint, typecheck, build, test, Prisma generate and audit. Documentation has been updated. Production audit uses `npm audit --omit=dev`; no forced audit fix is part of the standard gate. |

## Items Implemented In This Update

- Email one-time-code MFA for admin roles.
- 5-in-5 login lockout with 15-minute temporary block.
- Password reset expiry reduced to 30 minutes.
- Forced password change uses the logged-in session user.
- Tenant password policy enforcement across password-setting flows.
- Invite set-password flow displays invalid, expired, used, mismatched and weak-password errors and redirects accepted invites to login with a success message.
- User-entered support/security email content escaped.
- Production HTTPS APP_URL guard, preview-safe Vercel URL fallback and HSTS header.
- `.env.example` placeholder expansion.

## Still Manual Or Framework-Only

- Re-authentication for all future dangerous actions needs full workflow integration.
- Data Rights export/erasure/rectification/anonymisation workflows are framework-only.
- DPIA checklist is missing.
- Privacy/Data Use Notice configuration is model-only/partial.
- Full breach management fields are partial.
- File upload/download remains disabled/framework-only unless private storage is added.
- Email template variable enforcement is partial.

## Release Gate Results For This Update

- `npm install`: passed.
- `npx prisma generate`: passed.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed.
- `npm run build`: passed.
- `npm audit --omit=dev`: passed after the targeted PostCSS override.
