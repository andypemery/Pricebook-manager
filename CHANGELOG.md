# Changelog

## Unreleased - APP_URL and HTTPS validation

- Added central deployment URL helpers for real production, preview and local development.
- Made real production fail when `APP_URL` is missing or not HTTPS, while allowing Vercel previews to use `https://${VERCEL_URL}` temporarily.
- Updated password reset and invite email links to use the central base URL helper.
- Documented that HTTPS/TLS is encryption in transit, not end-to-end encryption.

## v1.0.9 - Security and GDPR hardening baseline

- Added `SECURITY_GDPR_HARDENING_AUDIT.md` with honest present, partial, missing and implemented statuses.
- Added email one-time-code MFA for Axiom Admin and Customer Admin users.
- Fixed the invited-user set-password flow so invite validation, password policy errors, mismatched passwords and accepted invites produce visible outcomes instead of silently clearing the form.
- Added 5-in-5 login lockout with a 15-minute temporary block.
- Reduced password reset expiry to 30 minutes while keeping invite links at 24 hours.
- Enforced tenant password policies across password-setting flows without allowing weaker-than-Axiom baseline settings.
- Changed forced password change to use the authenticated session user instead of asking for email.
- Escaped user-entered support/security text before inserting it into HTML emails.
- Added HSTS and documented HTTPS/TLS encryption-in-transit requirements.
- Expanded environment placeholder documentation.

## v1.0.8 deployment hotfix - Email provider enum typing

- Fixed Vercel build failure in `lib/actions/email.actions.ts` where `EmailProviderSetting.status` was inferred as a plain string.
- Changed the email settings save, disconnect and Axiom fallback paths to use the generated Prisma `EmailConnectionStatus` enum.
- Changed the Axiom fallback update path to use `EmailProviderMode.AXIOM`.
- No schema changes and no functional redesign in this hotfix.

# v1.0.8 - Configurable Outbound Email Provider Layer

- Added shared outbound email provider layer for Axiom sender, customer Microsoft 365 / Microsoft Graph, and custom SMTP.
- Added Account → Email Settings for permitted Admin users.
- Added Axiom Admin email provider overview, test send and force-fallback controls.
- Added EmailProviderSetting and EmailSendLog models.
- Preserved v1.0.7 routes, login, user import, themes, permissions, retention and deployment settings.

# Changelog

## v1.0.7 - Prisma JSON import fix

- Fixed Vercel build failure in `lib/actions/admin.actions.ts` where `UserImportRow.permissions` was read as Prisma `JsonValue` and written directly into `User.permissions`.
- Added `normaliseImportPermissions()` so imported permission JSON is converted into a safe `Record<string, boolean>` before saving.
- Keeps `manageAxiomControls` forced to `false` for imported customer users.

## v1.0.6

- Added user import flow, list-first pages, fixed 20-row pagination, updated password reveal behaviour, and retention configuration.

## v1.0.5

- Added Axiom dark/light theme refresh using brand colours.
# Changelog

## v1.0.4

- Renamed the generic sample module to **Demo Records** and documented that it must be removed or replaced before a real customer app is created.
- Simplified main navigation so **Dashboard** is always first and **Account** is the single entry point for account/support/admin areas.
- Added a tile-style Account page that shows only sections permitted for the current user.
- Moved user-facing access to Support, Feature Requests, Report Security Issue, Data Rights, File Register, Audit Log, Role Templates and Appearance into the Account page.
- Kept Backup Status as Axiom Admin-only.
- Added tenant-scoped Audit Log page for Customer Admin users with `viewAudit` permission.
- Changed user creation to an invite-only flow: Customer Admin enters email, first name, surname and role template; the app sends a 24-hour set-password link.
- Added `/set-password` invite acceptance route.
- Added pending/expired invite status and Resend Invite button on the user list.
- Added locked role template management for View Only, Super User and Admin, with configurable customer-level permissions inside Axiom-controlled limits.
- Improved user form labels and input styling.
- Added per-user Appearance setting for Dark, Light and System mode.
- Added Microsoft 365 sender routing structure so different notification types can use different shared mailbox sender profiles.

## v1.0.3

- Patched protected user typing so authenticated app pages have a guaranteed tenant/customer ID.

## v1.0.2

- Rebuilt Prisma schema into valid multi-line Prisma format.

## v1.0.1

- Rebuilt package-lock references to use the public npm registry.

## v1.0.0

- Initial reusable Axiom Standard Base App package.

## v1.0.5 - Axiom Brand Theme Update
- Updated the central theme configuration with the selected Axiom dark and light theme direction.
- Set the dark theme to use the Axiom branded #120462 as the dominant shell/background colour.
- Set primary filled buttons and key active accents to use the #00c7f3 / #00ece3 Axiom accent treatment.
- Refined light theme tokens so light mode stays clean and corporate while still using #120462 for brand text/headings and #00c7f3 for primary actions.
- Refined sidebar, card, table, form, password field, login and mobile menu styling to use the central Axiom theme tokens rather than random colours.


## v1.0.6 - User import, list behaviour and password reveal refinement

Added the agreed non-theme updates from Andy's follow-up questions:

- User list pages now show the list first, with top actions for Add user, Import users and Download import template.
- User creation has moved to a separate Add user page.
- Save/submit buttons use a temporary Saving... state through the shared SubmitButton component.
- Users & Permissions now uses fixed 20-row pagination with next/previous controls and no user-controlled row-count increase.
- Demo Records now also uses fixed 20-row pagination and keeps subject/title links as the way to open detail pages.
- Added Excel .xlsx user import template generation with Users and Instructions tabs.
- Import template includes sample rows and plain-English notes.
- User import supports First name, Surname, Email, Role and optional Y/N permission columns.
- If permission columns are omitted or left blank, users inherit the current role template settings.
- Imports create a preview batch first. Valid rows can be confirmed; bad rows are skipped and reported.
- Confirmed imports create valid users as pending invited users and send one invite email per valid user immediately.
- Duplicate existing email addresses are skipped rather than updated.
- Skipped rows are shown on screen and can be downloaded as CSV for correction/re-upload.
- Permission labels now avoid the word “Can”, for example View records, Create records and View audit log.
- Password reveal now uses a proper eye icon button and remains press-and-hold only.
- Browser/internal password reveal controls are suppressed where supported.
- Added standard retention configuration: normal closed support tickets delete after 12 months; feature requests retain for 3 years.

Release-gate note: npm ci --ignore-scripts and npm run lint were run successfully in the sandbox. Prisma generate, typecheck and build could not be completed in the sandbox because Prisma engine download from binaries.prisma.sh is blocked here. Vercel should run Prisma generation during deployment.
