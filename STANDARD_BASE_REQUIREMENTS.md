# Axiom Standard Base App Requirements Notes

## Demo Records

The base app includes a module called **Demo Records**. This module is only included so the reusable base can prove that tenant-scoped create, list, open, edit and archive-style workflows work before app-specific modules are added.

For every real customer app, **Demo Records must be removed or replaced** with the actual app-specific workflow module before customer handover. Do not leave Demo Records in customer navigation unless Andy explicitly approves it for a training/demo build.

## Navigation Standard

Dashboard must always be the first main navigation item. Account should be a single main navigation item that opens a tile-style account page. The Account page should show only the sections the logged-in user has permission to access.

## Account Section Standard

Account should contain user/account level areas such as Appearance, Users & Permissions, Role Templates, Support, Feature Requests, Report Security Issue, Data Rights, File Register and tenant Audit Log where the user has permission. Backup Status remains Axiom Admin-only.

## User Invite Standard

Customer Admin users must not create temporary passwords for normal users. New users should be invited by email and must set their own password using a secure link. The standard invite link is valid for 24 hours or until used. The user list must show pending/expired invites and include a Resend Invite action.

## Email Sender Standard

The app should use the same Microsoft Graph / Microsoft 365 sending approach as the Axiom Customer Operations Hub. The base supports different sender/shared-mailbox environment variables by notification type, for example invites, support and security issue emails.

## v1.0.5 theme decision

The standard base app now includes the selected Axiom dark and light theme direction.

- Dark theme: dominant shell/background colour should use Axiom #120462 with subtle darker depth layers.
- Primary filled buttons and key active/interactive accents should use Axiom #00c7f3, with #00ece3 used as the secondary accent in gradients and focus states.
- Light theme: should remain clean and white/light, using #120462 for brand headings/text and #00c7f3 for primary actions and highlights.
- Do not introduce random one-off brand colours into future app builds. Extend the central theme tokens instead.


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
