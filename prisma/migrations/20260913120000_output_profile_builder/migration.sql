-- Sprint 4 Batch 1 stores compact validated-source metadata and reusable output layouts.
CREATE TABLE "SourceWorkbookImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileReferenceId" TEXT,
    "originalFileName" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "validationStatus" TEXT NOT NULL DEFAULT 'VALIDATED',
    "validationSummary" JSONB NOT NULL,
    "createdById" TEXT,
    "validatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SourceWorkbookImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SourceWorksheet" (
    "id" TEXT NOT NULL,
    "sourceWorkbookImportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "detectedHeaderRow" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "columnCount" INTEGER NOT NULL,
    "headers" JSONB NOT NULL,
    "sampleRows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SourceWorksheet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutputProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceWorkbookImportId" TEXT NOT NULL,
    "sourceWorksheetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OutputProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutputProfileColumn" (
    "id" TEXT NOT NULL,
    "outputProfileId" TEXT NOT NULL,
    "columnType" TEXT NOT NULL DEFAULT 'SOURCE',
    "sourceColumnIndex" INTEGER,
    "sourceHeading" TEXT,
    "outputHeading" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "configuration" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OutputProfileColumn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SourceWorkbookImport_tenantId_createdAt_idx" ON "SourceWorkbookImport"("tenantId", "createdAt");
CREATE INDEX "SourceWorkbookImport_fileReferenceId_idx" ON "SourceWorkbookImport"("fileReferenceId");
CREATE UNIQUE INDEX "SourceWorksheet_sourceWorkbookImportId_name_key" ON "SourceWorksheet"("sourceWorkbookImportId", "name");
CREATE INDEX "SourceWorksheet_sourceWorkbookImportId_position_idx" ON "SourceWorksheet"("sourceWorkbookImportId", "position");
CREATE INDEX "OutputProfile_tenantId_updatedAt_idx" ON "OutputProfile"("tenantId", "updatedAt");
CREATE INDEX "OutputProfile_sourceWorkbookImportId_idx" ON "OutputProfile"("sourceWorkbookImportId");
CREATE INDEX "OutputProfile_sourceWorksheetId_idx" ON "OutputProfile"("sourceWorksheetId");
CREATE UNIQUE INDEX "OutputProfileColumn_outputProfileId_position_key" ON "OutputProfileColumn"("outputProfileId", "position");
CREATE INDEX "OutputProfileColumn_outputProfileId_idx" ON "OutputProfileColumn"("outputProfileId");

ALTER TABLE "SourceWorkbookImport" ADD CONSTRAINT "SourceWorkbookImport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceWorkbookImport" ADD CONSTRAINT "SourceWorkbookImport_fileReferenceId_fkey" FOREIGN KEY ("fileReferenceId") REFERENCES "FileReference"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceWorkbookImport" ADD CONSTRAINT "SourceWorkbookImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SourceWorksheet" ADD CONSTRAINT "SourceWorksheet_sourceWorkbookImportId_fkey" FOREIGN KEY ("sourceWorkbookImportId") REFERENCES "SourceWorkbookImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutputProfile" ADD CONSTRAINT "OutputProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutputProfile" ADD CONSTRAINT "OutputProfile_sourceWorkbookImportId_fkey" FOREIGN KEY ("sourceWorkbookImportId") REFERENCES "SourceWorkbookImport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutputProfile" ADD CONSTRAINT "OutputProfile_sourceWorksheetId_fkey" FOREIGN KEY ("sourceWorksheetId") REFERENCES "SourceWorksheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutputProfile" ADD CONSTRAINT "OutputProfile_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutputProfile" ADD CONSTRAINT "OutputProfile_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutputProfileColumn" ADD CONSTRAINT "OutputProfileColumn_outputProfileId_fkey" FOREIGN KEY ("outputProfileId") REFERENCES "OutputProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
