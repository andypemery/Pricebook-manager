-- Sprint 4 adds reusable multi-worksheet output preferences without persisting run-specific worksheet IDs.
CREATE TYPE "OutputProfileWorksheetMode" AS ENUM ('COMBINE', 'SEPARATE_WORKSHEETS', 'SEPARATE_FILES');
CREATE TYPE "OutputProfileWorksheetNameMode" AS ENUM ('SOURCE', 'CUSTOM');

ALTER TABLE "OutputProfile"
ADD COLUMN "worksheetMode" "OutputProfileWorksheetMode" NOT NULL DEFAULT 'COMBINE',
ADD COLUMN "worksheetNameMode" "OutputProfileWorksheetNameMode" NOT NULL DEFAULT 'SOURCE',
ADD COLUMN "worksheetNameMappings" JSONB NOT NULL DEFAULT '{}';
