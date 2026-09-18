-- Sparse, reversible source-row exclusions. Existing workbook, Project and
-- Output Profile data is unchanged; deleting a source import/worksheet cascades
-- only its exclusion metadata.
CREATE TABLE "SourceWorkbookRowExclusion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceWorkbookImportId" TEXT NOT NULL,
    "sourceWorksheetId" TEXT NOT NULL,
    "physicalRowNumber" INTEGER NOT NULL,
    "rowFingerprint" TEXT NOT NULL,
    "excludedById" TEXT NOT NULL,
    "excludedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceWorkbookRowExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceWorkbookRowExclusion_sourceWorkbookImportId_sourceWorksheetId_physicalRowNumber_key"
ON "SourceWorkbookRowExclusion"("sourceWorkbookImportId", "sourceWorksheetId", "physicalRowNumber");
CREATE INDEX "SourceWorkbookRowExclusion_tenantId_sourceWorkbookImportId_idx"
ON "SourceWorkbookRowExclusion"("tenantId", "sourceWorkbookImportId");
CREATE INDEX "SourceWorkbookRowExclusion_sourceWorksheetId_physicalRowNumber_idx"
ON "SourceWorkbookRowExclusion"("sourceWorksheetId", "physicalRowNumber");
CREATE INDEX "SourceWorkbookRowExclusion_excludedById_idx"
ON "SourceWorkbookRowExclusion"("excludedById");

ALTER TABLE "SourceWorkbookRowExclusion" ADD CONSTRAINT "SourceWorkbookRowExclusion_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceWorkbookRowExclusion" ADD CONSTRAINT "SourceWorkbookRowExclusion_sourceWorkbookImportId_fkey"
FOREIGN KEY ("sourceWorkbookImportId") REFERENCES "SourceWorkbookImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceWorkbookRowExclusion" ADD CONSTRAINT "SourceWorkbookRowExclusion_sourceWorksheetId_fkey"
FOREIGN KEY ("sourceWorksheetId") REFERENCES "SourceWorksheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SourceWorkbookRowExclusion" ADD CONSTRAINT "SourceWorkbookRowExclusion_excludedById_fkey"
FOREIGN KEY ("excludedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
