# Smoke Test Script

Run after deployment.

1. Log in as seeded Axiom Admin.
2. Complete forced password change if prompted.
3. Confirm Dashboard loads and is the first navigation item.
4. Confirm Demo Records is clearly labelled as demo-only.
5. Open Account and confirm tile-style navigation appears.
6. Confirm Account only shows areas the current user has rights to access.
7. Open Account > Appearance and change between Dark and Light mode.
8. Open Account > Users & Permissions as Customer Admin or Axiom Admin.
9. Invite a new user with email, first name, surname and role template.
10. Confirm no temporary password field is shown.
11. Confirm invited user appears immediately in the user list as pending.
12. Confirm Resend Invite appears for pending/expired users.
13. Open the invite link from email or server logs and set a password.
14. Confirm the invite cannot be reused after password setup.
15. Confirm the new user can log in after setting their password.
16. Open Account > Role Templates and confirm View Only, Super User and Admin names are locked.
17. Change permissions inside a role template and confirm it saves.
18. Confirm Support is available to logged-in users.
19. Confirm Report Security Issue is available to logged-in users.
20. Confirm Feature Requests are available to users with operational/create access or admin access.
21. Confirm Customer Admin can view Audit Log for their own tenant only.
22. Confirm Backup Status is visible only to Axiom Admin.
23. Confirm customer users cannot access `/axiom-admin/diagnostics` directly.
24. Confirm customer users cannot access another tenant by changing URL IDs.
25. Confirm mobile menu opens and closes on a narrow screen.
26. Confirm Microsoft Graph email variables are configured before relying on email delivery.
27. Confirm build logs show Prisma db push with `--skip-generate`, one Prisma generate step and Next build completing successfully.
