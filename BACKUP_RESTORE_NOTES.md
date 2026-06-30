# Backup and restore notes

The base includes the database schema and admin-facing framework for database and blob backup status. It does not include a fully automated disaster recovery service.

The Backup Status page is intentionally honest: it shows recorded status and framework information only. Restore remains an Axiom/internal technical procedure unless a future customer app deliberately wires and tests automated restore actions.

Standard direction:

- Database backups use managed provider backup/PITR where available.
- File/blob backups are separate from database backups.
- Files are stored in object/blob storage with FileReference metadata in the database.
- Axiom controls restore retention: 7, 30 or 90 days.
- Default operational restore retention is 7 days.
- Long-term customer retention, such as seven years, belongs in retention rules/archive data, not in rolling operational backups unless separately agreed and priced.
