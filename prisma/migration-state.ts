import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type LocalMigration = {
  name: string;
  checksum: string;
};

export type DatabaseMigration = {
  migrationName: string;
  checksum: string;
  startedAt: Date;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
};

export type MigrationStateResult = {
  ok: boolean;
  errors: string[];
  localCount: number;
  databaseCount: number;
};

const missingHistoryMessage =
  "Database migration history is not initialised. Complete the authorised migration baseline procedure before deployment.";

function duplicateNames(names: string[]) {
  return [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
}

export function migrationChecksum(contents: Buffer | string) {
  // Prisma 6 stores the lower-case hexadecimal SHA-256 of the migration.sql bytes.
  return createHash("sha256").update(contents).digest("hex");
}

export async function loadLocalMigrations(
  migrationsDirectory = path.join(process.cwd(), "prisma", "migrations")
): Promise<LocalMigration[]> {
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const migrationNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    migrationNames.map(async (name) => {
      const sql = await readFile(path.join(migrationsDirectory, name, "migration.sql"));
      return { name, checksum: migrationChecksum(sql) };
    })
  );
}

export function evaluateMigrationState(
  localMigrations: LocalMigration[],
  databaseMigrations: DatabaseMigration[] | null
): MigrationStateResult {
  const errors: string[] = [];

  if (localMigrations.length === 0) {
    errors.push("No local Prisma migrations were found. Deployment cannot verify the expected database state.");
  }

  const duplicateLocalNames = duplicateNames(localMigrations.map(({ name }) => name));
  if (duplicateLocalNames.length > 0) {
    errors.push(`Duplicate local migration names found: ${duplicateLocalNames.join(", ")}.`);
  }

  if (databaseMigrations === null) {
    errors.push(missingHistoryMessage);
    return {
      ok: false,
      errors,
      localCount: localMigrations.length,
      databaseCount: 0
    };
  }

  const duplicateDatabaseNames = duplicateNames(
    databaseMigrations.map(({ migrationName }) => migrationName)
  );
  if (duplicateDatabaseNames.length > 0) {
    errors.push(`Database migration history contains duplicate records: ${duplicateDatabaseNames.join(", ")}.`);
  }

  const localByName = new Map(localMigrations.map((migration) => [migration.name, migration]));
  const databaseByName = new Map(
    databaseMigrations.map((migration) => [migration.migrationName, migration])
  );

  for (const migration of databaseMigrations) {
    if (migration.rolledBackAt !== null) {
      errors.push(`Database migration ${migration.migrationName} is unexpectedly marked as rolled back.`);
    }

    if (migration.finishedAt === null) {
      errors.push(`Database migration ${migration.migrationName} is failed or incomplete.`);
    }

    const localMigration = localByName.get(migration.migrationName);
    if (!localMigration) {
      errors.push(`Database migration ${migration.migrationName} is not present in this deployment commit.`);
      continue;
    }

    if (localMigration.checksum.toLowerCase() !== migration.checksum.toLowerCase()) {
      errors.push(`Database migration ${migration.migrationName} does not match the repository checksum.`);
    }
  }

  for (const migration of localMigrations) {
    if (!databaseByName.has(migration.name)) {
      errors.push(
        `Database migration ${migration.name} has not been applied. Apply approved migrations through the guarded release process before deploying this commit.`
      );
    }
  }

  const expectedOrder = localMigrations.map(({ name }) => name);
  const databaseOrder = databaseMigrations.map(({ migrationName }) => migrationName);
  if (
    expectedOrder.length === databaseOrder.length &&
    expectedOrder.some((name, index) => databaseOrder[index] !== name)
  ) {
    errors.push("Database migration history order does not match the repository migration order.");
  }

  return {
    ok: errors.length === 0,
    errors,
    localCount: localMigrations.length,
    databaseCount: databaseMigrations.length
  };
}
