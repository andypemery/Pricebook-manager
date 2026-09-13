-- Sprint 4 Batch 2 adds explicit output transformations and ordered source-row filters.
CREATE TYPE "OutputProfileColumnType" AS ENUM ('SOURCE', 'STATIC');
CREATE TYPE "OutputValueAdjustmentType" AS ENUM ('NONE', 'MULTIPLY', 'DIVIDE', 'PERCENT_INCREASE', 'PERCENT_DECREASE');
CREATE TYPE "OutputProfileFilterMatchMode" AS ENUM ('ALL', 'ANY');
CREATE TYPE "OutputProfileFilterOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'CONTAINS', 'NOT_CONTAINS', 'STARTS_WITH', 'IS_BLANK', 'IS_NOT_BLANK', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL');

ALTER TABLE "OutputProfile"
ADD COLUMN "filterMatchMode" "OutputProfileFilterMatchMode" NOT NULL DEFAULT 'ALL';

ALTER TABLE "OutputProfileColumn" ALTER COLUMN "columnType" DROP DEFAULT;
ALTER TABLE "OutputProfileColumn"
ALTER COLUMN "columnType" TYPE "OutputProfileColumnType"
USING ("columnType"::"OutputProfileColumnType");
ALTER TABLE "OutputProfileColumn" ALTER COLUMN "columnType" SET DEFAULT 'SOURCE';

ALTER TABLE "OutputProfileColumn"
ADD COLUMN "staticValue" TEXT,
ADD COLUMN "adjustmentType" "OutputValueAdjustmentType" NOT NULL DEFAULT 'NONE',
ADD COLUMN "adjustmentValue" DECIMAL(30,12),
ADD COLUMN "roundingDecimalPlaces" INTEGER;

CREATE TABLE "OutputProfileFilterRule" (
    "id" TEXT NOT NULL,
    "outputProfileId" TEXT NOT NULL,
    "sourceColumnIndex" INTEGER NOT NULL,
    "sourceHeading" TEXT NOT NULL,
    "operator" "OutputProfileFilterOperator" NOT NULL,
    "comparisonValue" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OutputProfileFilterRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutputProfileFilterRule_outputProfileId_position_key" ON "OutputProfileFilterRule"("outputProfileId", "position");
CREATE INDEX "OutputProfileFilterRule_outputProfileId_idx" ON "OutputProfileFilterRule"("outputProfileId");

ALTER TABLE "OutputProfileFilterRule"
ADD CONSTRAINT "OutputProfileFilterRule_outputProfileId_fkey"
FOREIGN KEY ("outputProfileId") REFERENCES "OutputProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
