# Known warnings and limitations

- Prisma engine generation could not be verified in the sandbox if `binaries.prisma.sh` is unavailable. Vercel should run `npx prisma generate` with internet access.
- Email sending is a Microsoft Graph placeholder until the tenant/app registration is connected.
- MFA screen exists as a placeholder and should be enabled only after email is working.
- Hub endpoints are present and signed, but live Customer Operations Hub sync still needs wiring.
- Backup/restore and file storage are framework-level in this base. Provider-specific automation must be connected per app.
- `npm audit --omit=dev` may report moderate advisories in Next/PostCSS until upstream packages resolve them. Review before production go-live.
- This is not a professional penetration test or legal GDPR assurance.
