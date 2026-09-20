import { PrismaClient } from "@prisma/client";
import {
  evaluateMigrationState,
  loadLocalMigrations,
  type DatabaseMigration
} from "./migration-state";

type DatabaseIdentity = {
  databaseName: string;
  migrationTableExists: boolean;
};

const prisma = new PrismaClient();

async function checkMigrationState() {
  const localMigrations = await loadLocalMigrations();
  const [identity] = await prisma.$queryRaw<DatabaseIdentity[]>`
    SELECT
      current_database() AS "databaseName",
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = '_prisma_migrations'
      ) AS "migrationTableExists"
  `;

  if (!identity) {
    throw new Error("Database identity query returned no result.");
  }

  const databaseMigrations = identity.migrationTableExists
    ? await prisma.$queryRaw<DatabaseMigration[]>`
        SELECT
          "migration_name" AS "migrationName",
          "checksum",
          "started_at" AS "startedAt",
          "finished_at" AS "finishedAt",
          "rolled_back_at" AS "rolledBackAt"
        FROM "_prisma_migrations"
        ORDER BY "started_at" ASC, "id" ASC
      `
    : null;

  const result = evaluateMigrationState(localMigrations, databaseMigrations);
  if (!result.ok) {
    console.error(`[migration-state] Database "${identity.databaseName}" is not ready for this deployment.`);
    for (const error of result.errors) {
      console.error(`[migration-state] ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `[migration-state] PASS: database "${identity.databaseName}" matches all ${result.localCount} repository migrations.`
  );
}

async function run() {
  try {
    await checkMigrationState();
  } catch {
    console.error(
      "[migration-state] Migration-state verification could not be completed. Check the configured database and release logs."
    );
    process.exitCode = 1;
  }

  try {
    await prisma.$disconnect();
  } catch {
    console.error("[migration-state] Database connection cleanup did not complete successfully.");
    process.exitCode = 1;
  }
}

void run();
