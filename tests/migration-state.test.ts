import { describe, expect, it } from "vitest";
import {
  evaluateMigrationState,
  loadLocalMigrations,
  migrationChecksum,
  type DatabaseMigration,
  type LocalMigration
} from "../prisma/migration-state";

const localMigrations: LocalMigration[] = [
  { name: "20260913120000_first", checksum: migrationChecksum("first") },
  { name: "20260913160000_second", checksum: migrationChecksum("second") }
];

const repositoryMigrationNames = [
  "20260913120000_output_profile_builder",
  "20260913160000_output_profile_rules",
  "20260913220000_reusable_output_profile_configuration",
  "20260916130000_validation_issue_overrides",
  "20260916170000_multi_worksheet_output_profiles",
  "20260917190000_projects_foundation",
  "20260918150000_source_row_exclusions"
];

function completedMigration(local: LocalMigration, hour: number): DatabaseMigration {
  return {
    migrationName: local.name,
    checksum: local.checksum,
    startedAt: new Date(`2026-09-13T${hour.toString().padStart(2, "0")}:00:00.000Z`),
    finishedAt: new Date(`2026-09-13T${hour.toString().padStart(2, "0")}:01:00.000Z`),
    rolledBackAt: null
  };
}

const completedDatabaseMigrations = [
  completedMigration(localMigrations[0], 12),
  completedMigration(localMigrations[1], 16)
];

describe("migration-state evaluation", () => {
  it("uses the Prisma 6 SHA-256 checksum format", () => {
    expect(migrationChecksum("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("loads the seven repository migrations in order and accepts matching completed history", async () => {
    const repositoryMigrations = await loadLocalMigrations();
    const matchingHistory = repositoryMigrations.map((migration, index) => ({
      migrationName: migration.name,
      checksum: migration.checksum,
      startedAt: new Date(Date.UTC(2026, 8, 13, index)),
      finishedAt: new Date(Date.UTC(2026, 8, 13, index, 1)),
      rolledBackAt: null
    }));

    expect(repositoryMigrations.map(({ name }) => name)).toEqual(repositoryMigrationNames);
    expect(evaluateMigrationState(repositoryMigrations, matchingHistory).ok).toBe(true);
  });

  it("passes when every repository migration is complete, ordered and checksum-matched", () => {
    expect(evaluateMigrationState(localMigrations, completedDatabaseMigrations)).toEqual({
      ok: true,
      errors: [],
      localCount: 2,
      databaseCount: 2
    });
  });

  it("fails when a local migration is pending", () => {
    const result = evaluateMigrationState(localMigrations, [completedDatabaseMigrations[0]]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Database migration 20260913160000_second has not been applied. Apply approved migrations through the guarded release process before deploying this commit."
    );
  });

  it("fails closed when the migration-history table is missing", () => {
    const result = evaluateMigrationState(localMigrations, null);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Database migration history is not initialised. Complete the authorised migration baseline procedure before deployment."
    );
  });

  it("fails when a database migration is unfinished", () => {
    const incomplete = { ...completedDatabaseMigrations[1], finishedAt: null };
    const result = evaluateMigrationState(localMigrations, [completedDatabaseMigrations[0], incomplete]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain("Database migration 20260913160000_second is failed or incomplete.");
  });

  it("fails when a database migration is unexpectedly rolled back", () => {
    const rolledBack = {
      ...completedDatabaseMigrations[1],
      rolledBackAt: new Date("2026-09-13T17:00:00.000Z")
    };
    const result = evaluateMigrationState(localMigrations, [completedDatabaseMigrations[0], rolledBack]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Database migration 20260913160000_second is unexpectedly marked as rolled back."
    );
  });

  it("fails when the database contains a migration absent from the repository", () => {
    const unknown = {
      ...completedMigration({ name: "20260914000000_unknown", checksum: migrationChecksum("unknown") }, 18)
    };
    const result = evaluateMigrationState(localMigrations, [...completedDatabaseMigrations, unknown]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Database migration 20260914000000_unknown is not present in this deployment commit."
    );
  });

  it("fails when an applied migration checksum differs from its local SQL", () => {
    const changed = { ...completedDatabaseMigrations[1], checksum: migrationChecksum("changed") };
    const result = evaluateMigrationState(localMigrations, [completedDatabaseMigrations[0], changed]);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Database migration 20260913160000_second does not match the repository checksum."
    );
  });

  it("fails explicitly when the repository migration list is empty", () => {
    const result = evaluateMigrationState([], []);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "No local Prisma migrations were found. Deployment cannot verify the expected database state."
    );
  });

  it("fails when database history order differs from repository order", () => {
    const wrongOrder = [
      completedMigration(localMigrations[1], 12),
      completedMigration(localMigrations[0], 16)
    ];
    const result = evaluateMigrationState(localMigrations, wrongOrder);

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Database migration history order does not match the repository migration order."
    );
  });
});
