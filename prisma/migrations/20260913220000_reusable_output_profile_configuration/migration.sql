-- Sprint 4 Batch 3 adds reusable filename and output-format configuration.
CREATE TYPE "OutputProfileFormat" AS ENUM ('CSV', 'XLSX');
CREATE TYPE "OutputProfileCsvDelimiter" AS ENUM ('COMMA', 'SEMICOLON', 'TAB', 'PIPE');

ALTER TABLE "OutputProfile"
ADD COLUMN "filenameTemplate" TEXT NOT NULL DEFAULT '{profile}_{date}',
ADD COLUMN "outputFormat" "OutputProfileFormat" NOT NULL DEFAULT 'CSV',
ADD COLUMN "csvDelimiter" "OutputProfileCsvDelimiter" NOT NULL DEFAULT 'COMMA',
ADD COLUMN "csvIncludeHeader" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "xlsxWorksheetName" TEXT;
