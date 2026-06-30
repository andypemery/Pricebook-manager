# Security Notes

This is a GDPR-aware and security-hardened base app, not a legal compliance certificate or penetration test.

## Implemented Security Controls

- Session cookies are HTTP-only, SameSite and Secure in production.
- Axiom Admin and Customer Admin users require email one-time-code MFA by default.
- Login lockout is enforced after 5 failed attempts in 5 minutes, with a 15-minute temporary block.
- Password reset links expire after 30 minutes. Invite links remain valid for 24 hours or until used.
- Password reset, invite and MFA codes are stored as hashes.
- Password policy is tenant-aware and cannot be weakened below the Axiom baseline.
- User-entered support and security issue text is escaped before being inserted into HTML emails.
- Tenant suspension blocks access at login/session checks.
- Axiom Hub endpoints require signed requests.

## Browser Security Headers

The app configures a baseline Content Security Policy, `Strict-Transport-Security`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`, `X-Frame-Options` and `frame-ancestors 'none'`.

## Encryption In Transit

Production browser-to-app-server traffic must use HTTPS/TLS. Real production is detected with `VERCEL_ENV=production` where available. In real production, `APP_URL` is required, must start with `https://`, and is the only allowed base URL for generated password reset and invite links.

Vercel preview deployments may use `https://${VERCEL_URL}` temporarily when `APP_URL` is not set. Preview URLs are not customer-facing production URLs and must not be used for customer handover. Local development may use `http://localhost:3000`.

This is encryption in transit only. The app does not claim end-to-end encryption.

## Framework-Only Areas

Data Rights advanced workflows, DPIA checklist, privacy notice acknowledgement and private file upload/download are not fully automated in this base app yet. They are documented in `SECURITY_GDPR_HARDENING_AUDIT.md` as partial or missing.
