-- Project Foundation V1: additive Project ownership and reusable-profile links.
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SourceWorkbookImport" ADD COLUMN "projectId" TEXT;

-- One deterministic Project per existing source import. Duplicate names are intentional.
INSERT INTO "Project" ("id", "tenantId", "name", "createdById", "updatedById", "createdAt", "updatedAt")
SELECT
  'project_' || "id",
  "tenantId",
  COALESCE(NULLIF(regexp_replace("originalFileName", '\.(xlsx|xlsm)$', '', 'i'), ''), 'Imported workbook'),
  "createdById",
  "createdById",
  "createdAt",
  "updatedAt"
FROM "SourceWorkbookImport";

UPDATE "SourceWorkbookImport"
SET "projectId" = 'project_' || "id";

ALTER TABLE "SourceWorkbookImport" ALTER COLUMN "projectId" SET NOT NULL;

CREATE TABLE "ProjectOutputProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "outputProfileId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectOutputProfile_pkey" PRIMARY KEY ("id")
);

-- Keep reusable profiles as masters; this only links their provenance Project.
INSERT INTO "ProjectOutputProfile" ("id", "tenantId", "projectId", "outputProfileId", "createdById", "createdAt", "updatedAt")
SELECT
  'project_profile_' || op."id",
  op."tenantId",
  'project_' || op."sourceWorkbookImportId",
  op."id",
  op."createdById",
  op."createdAt",
  op."updatedAt"
FROM "OutputProfile" op;

CREATE UNIQUE INDEX "ProjectOutputProfile_projectId_outputProfileId_key" ON "ProjectOutputProfile"("projectId", "outputProfileId");
CREATE INDEX "Project_tenantId_updatedAt_idx" ON "Project"("tenantId", "updatedAt");
CREATE INDEX "SourceWorkbookImport_tenantId_projectId_updatedAt_idx" ON "SourceWorkbookImport"("tenantId", "projectId", "updatedAt");
CREATE INDEX "ProjectOutputProfile_tenantId_projectId_idx" ON "ProjectOutputProfile"("tenantId", "projectId");
CREATE INDEX "ProjectOutputProfile_tenantId_outputProfileId_idx" ON "ProjectOutputProfile"("tenantId", "outputProfileId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceWorkbookImport" ADD CONSTRAINT "SourceWorkbookImport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectOutputProfile" ADD CONSTRAINT "ProjectOutputProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectOutputProfile" ADD CONSTRAINT "ProjectOutputProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectOutputProfile" ADD CONSTRAINT "ProjectOutputProfile_outputProfileId_fkey" FOREIGN KEY ("outputProfileId") REFERENCES "OutputProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectOutputProfile" ADD CONSTRAINT "ProjectOutputProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
