# Axiom Standard Base App v1.0.8 - Email Provider Layer

This update adds a shared outbound email provider layer without rebuilding the v1.0.7 app from scratch. Existing v1.0.7 behaviour has been preserved and email sending now routes through `lib/email.ts`.

## Supported modes

1. **Axiom sender**: default. Uses Axiom-controlled sender details, normally `notifications@axiomps.co.uk` with reply-to `Support@Axiomps.co.uk`.
2. **Customer Microsoft 365 / Microsoft Graph**: customer/provider configuration is stored in `EmailProviderSetting`. The app does not ask for Microsoft account passwords. App-level Graph sending uses tenant ID, client ID, client secret and a sender mailbox/user ID. Delegated OAuth/admin-consent flow is scaffolded for future extension.
3. **Custom SMTP**: fallback option using SMTP host, port, username, secret, TLS option, from address and reply-to. Saved secrets are encrypted and never shown back in the UI.

## Screens

- Customer Admin: `Account → Email Settings`
- Axiom Admin: `Axiom Admin → Email provider overview`

## Testing

Use the Send Test Email area. After a successful send, the recipient field clears and a safe result is stored. Test attempts and failures are logged through audit and `EmailSendLog`.

## Fallback

If a customer provider fails and fallback is enabled, the app attempts the Axiom sender. If neither provider is configured, the user receives a safe error message. Secrets and tokens are not logged.

## Database changes

Added additive models only: `EmailProviderSetting` and `EmailSendLog`, plus email provider enums and Tenant/User relations. Existing models were not removed or renamed.
