-- Sprint 4 direct output generation: persist only deliberate validation overrides.
CREATE TABLE "ValidationIssueOverride" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceWorkbookImportId" TEXT NOT NULL,
    "issueFingerprint" TEXT NOT NULL,
    "ignoredById" TEXT NOT NULL,
    "ignoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidationIssueOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ValidationIssueOverride_sourceWorkbookImportId_issueFingerprint_key" ON "ValidationIssueOverride"("sourceWorkbookImportId", "issueFingerprint");
CREATE INDEX "ValidationIssueOverride_tenantId_sourceWorkbookImportId_idx" ON "ValidationIssueOverride"("tenantId", "sourceWorkbookImportId");
CREATE INDEX "ValidationIssueOverride_ignoredById_idx" ON "ValidationIssueOverride"("ignoredById");

ALTER TABLE "ValidationIssueOverride" ADD CONSTRAINT "ValidationIssueOverride_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ValidationIssueOverride" ADD CONSTRAINT "ValidationIssueOverride_sourceWorkbookImportId_fkey" FOREIGN KEY ("sourceWorkbookImportId") REFERENCES "SourceWorkbookImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ValidationIssueOverride" ADD CONSTRAINT "ValidationIssueOverride_ignoredById_fkey" FOREIGN KEY ("ignoredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
