# One-time Production migration bootstrap

This runbook is for a separately authorised Production release. It must not be run as part of a Vercel build. The current known Production application baseline is `ccf0d5f5ad5ac58f3bb5c06c98a78ecb81a97ffd`. Production is non-empty, predates all seven Sprint 4 migrations, has no Prisma `_prisma_migrations` history, and was previously verified not to contain the Project Foundation or source-row-exclusion tables. The new read-only build guard is expected to block Production until this runbook has been completed and verified.

## Hard STOP conditions

Stop without changing Production if any of the following is true:

- written authorisation for this exact Production change window is absent;
- the Neon account, project, branch, database, or direct connection cannot be positively identified as Production;
- the connection is pooled rather than a direct, non-pooled Neon connection;
- a current backup/restore point has not been verified;
- the application commit or migration files differ from the reviewed candidate;
- `_prisma_migrations` exists unexpectedly or contains any record;
- inspection finds an unexpected, partial, or contradictory migration effect;
- any SQL review, execution, schema check, backfill check, or health check fails;
- any proposed action would expose a credential in logs, source control, screenshots, or chat.

Do not use `vercel env pull` or `vercel env run`. Do not change a Vercel Sensitive value because it appears blank locally. Obtain a fresh, verified direct connection from Neon for the exact Production branch, supply it to `DATABASE_URL` only in the secured release process, and let Vercel continue to inject its existing values normally.

## 1. Identify and protect the target

1. Check out the exact approved application commit and confirm the worktree is clean.
2. In Neon, record the expected account, project ID/name, Production branch ID/name, database name, and role without recording a password or connection string.
3. Obtain the direct, non-pooled connection for that branch and independently confirm `current_database()`, current schema, and the branch identity. Do not rely on a hostname copied from Vercel.
4. Create or verify a current restore point/backup and document the tested recovery owner and rollback decision point.
5. Put Production into the approved maintenance/release state. Prevent a concurrent deploy or schema change.

## 2. Inspect before changing anything

Run read-only inspection using the verified connection:

```sql
SELECT current_database(), current_schema();
SELECT to_regclass('"_prisma_migrations"') AS migration_history;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = current_schema()
ORDER BY table_name;
```

Confirm that the database is non-empty and that `_prisma_migrations` is absent. If the history table exists, STOP and reconcile it separately; do not delete, overwrite, or baseline it.

Review the SQL file and inspect the corresponding schema/data before each step:

| Order | Migration | Effects that must be absent before execution and present before recording |
| --- | --- | --- |
| 1 | `20260913120000_output_profile_builder` | Four output/source tables, their indexes and foreign keys |
| 2 | `20260913160000_output_profile_rules` | Rule enums, profile/column fields, filter-rule table and constraints |
| 3 | `20260913220000_reusable_output_profile_configuration` | Output-format/delimiter enums and reusable filename/format fields |
| 4 | `20260916130000_validation_issue_overrides` | Validation override table, indexes and foreign keys |
| 5 | `20260916170000_multi_worksheet_output_profiles` | Worksheet-mode enums and profile worksheet fields |
| 6 | `20260917190000_projects_foundation` | Project/link tables, source-import Project backfill, indexes and foreign keys |
| 7 | `20260918150000_source_row_exclusions` | Sparse row-exclusion table, indexes and foreign keys |

For every migration, classify its effects as **absent**, **fully present and verified**, or **partial/unexpected**. A partial/unexpected result is a STOP condition requiring a reviewed remediation plan. Never mark a migration applied merely to make history look complete.

## 3. Bootstrap with supported Prisma 6 semantics

Prisma `migrate deploy` correctly refuses a non-empty unbaselined database. For this legacy transition only, use Prisma's supported `db execute` to apply the first reviewed migration without touching history, verify its actual schema/data effects, and only then record that exact migration with `migrate resolve --applied`. Once that verified first record has initialised `_prisma_migrations`, use the normal `migrate deploy` command to apply and record the remaining six migrations in repository order.

Use Prisma 6.19.3 from this repository and the securely supplied direct `DATABASE_URL`.

1. Re-read `prisma/migrations/20260913120000_output_profile_builder/migration.sql` and confirm all its effects are absent.
2. Apply that exact reviewed SQL without altering migration history:

   ```text
   npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260913120000_output_profile_builder/migration.sql
   ```

3. Inspect all four created tables, indexes, constraints and existing-row health. If any effect is missing or incorrect, STOP and do not record the migration.
4. Only after those effects are verified, initialise history with:

   ```text
   npx prisma migrate resolve --schema prisma/schema.prisma --applied 20260913120000_output_profile_builder
   ```

5. Recheck `_prisma_migrations`: it must contain exactly that one finished, non-rolled-back record with the repository checksum.
6. Review the remaining six SQL files again, then apply them with normal Prisma migration semantics:

   ```text
   npm run db:migrate:deploy
   ```

   Prisma must apply them in the table's order, starting with `20260913160000_output_profile_rules` and ending with `20260918150000_source_row_exclusions`. Stop on any error; do not use `migrate resolve` to conceal a failed or partial migration.

If pre-change inspection proves that the first migration's effects are already fully present, do not execute its SQL again: verify every effect and use only the matching `migrate resolve --applied` command. If a contiguous later migration is also fully present, it may be resolved only after every one of its effects and all preceding migration effects are verified in writing. Any partial effect, non-contiguous state, or uncertainty is a STOP condition requiring a separate reviewed remediation plan.

## 4. Verify the completed transition

1. Run `npm run db:check-migrations`; it must report all seven repository migrations complete and checksum-matched.
2. Run `npx prisma migrate status --schema prisma/schema.prisma`; it must report the database up to date.
3. Inspect `_prisma_migrations` and confirm exactly seven names in the order above, non-null `finished_at`, null `rolled_back_at`, and repository-matching checksums.
4. Confirm the schema objects, indexes, enum values, constraints and defaults described in the table above.
5. Confirm every `SourceWorkbookImport.projectId` is non-null and points to a same-tenant `Project`.
6. Confirm every expected existing `OutputProfile` has its same-tenant `ProjectOutputProfile` link, with no duplicate or orphan link.
7. Confirm there are zero orphan validation overrides or row exclusions and that all foreign-key constraints validate.
8. Run the approved database, application and authentication smoke/health checks. Preserve customer/tenant separation throughout.

Use read-only queries such as these for the history and migration-specific backfill checks; every count must be zero:

```sql
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY started_at, id;

SELECT COUNT(*) AS source_imports_missing_project
FROM "SourceWorkbookImport" source
LEFT JOIN "Project" project
  ON project.id = source."projectId" AND project."tenantId" = source."tenantId"
WHERE source."projectId" IS NULL OR project.id IS NULL;

SELECT COUNT(*) AS output_profiles_missing_project_link
FROM "OutputProfile" profile
JOIN "SourceWorkbookImport" source ON source.id = profile."sourceWorkbookImportId"
LEFT JOIN "ProjectOutputProfile" link
  ON link."outputProfileId" = profile.id
 AND link."projectId" = source."projectId"
 AND link."tenantId" = profile."tenantId"
WHERE link.id IS NULL;
```

Also run explicit orphan counts for `ValidationIssueOverride` and `SourceWorkbookRowExclusion` against each referenced tenant, source import, worksheet and user. Do not treat foreign-key presence alone as proof that the intended tenant relationship is correct.

Any non-zero orphan/backfill result is a STOP condition. Do not deploy application code while verification is incomplete.

## 5. Allow the application release only after verification

After every check passes, integrate the exact approved candidate onto `main`, push `main` normally, allow or trigger the Production deployment from `main`, verify Vercel reaches READY, confirm the deployed SHA matches the intended `origin/main`, and verify database/runtime health. Never deploy a detached or feature commit to Production and leave it off `main`.

After this one-time transition, use the normal steady state: inspect and approve each new migration, verify the exact target Neon branch, run `npm run db:migrate:deploy` manually before the matching code deployment, verify with `npm run db:check-migrations`, then deploy. Vercel remains read-only with respect to schema.

## Prisma 6 references

- [Baselining an existing database](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/baselining)
- [Patching and hotfixing with `db execute` and `migrate resolve`](https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing)
- [Deploying approved migrations with `migrate deploy`](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-database-changes-with-prisma-migrate)
