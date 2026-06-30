# Axiom Standard Base App

Reusable source-code foundation for future Axiom standard apps.

This is not a customer app. It is the base app that future Axiom apps should start from.

## Important

The **Demo Records** module is included only to prove base create/list/open/edit patterns. Remove or replace Demo Records when creating a real customer app.

Read these files before deployment:

- `SECURITY_GDPR_HARDENING_AUDIT.md`
- `README_DEPLOYMENT.md`
- `ENVIRONMENT_VARIABLES.md`
- `STANDARD_BASE_REQUIREMENTS.md`
- `BUILD_CHECK_RESULTS.md`
- `SMOKE_TEST_SCRIPT.md`
- `SECURITY_NOTES.md`
- `BACKUP_RESTORE_NOTES.md`

## Security hardening baseline

The base app includes opt-in email-code MFA, temporary login lockout, tenant-aware password policy enforcement, 30-minute password reset links, secure production cookies, baseline browser security headers and HTTPS/TLS deployment requirements. Some GDPR-support areas remain framework-only and are recorded in `SECURITY_GDPR_HARDENING_AUDIT.md`.

## Standard Axiom defaults

Safe non-secret defaults are centralised in `config/axiom-defaults.ts` and pre-filled for new deployments:

- Axiom Admin email: `Andy.Emery@axiomps.co.uk`
- Sender and reply-to email: `notifications@axiomps.co.uk`
- Sender display name: `Axiom Notifications`
- Company name: `Axiom Process Solutions`
- Support/security contact email: `notifications@axiomps.co.uk`

Secrets, database URLs, provider credentials, storage tokens and temporary passwords must still be supplied through environment variables.
