# SheetJS Security Review

## Decision

Axiom Data Mapper must not use the npm `xlsx` package for workbook imports.

Sprint 2 replaced `xlsx@0.18.5` with `exceljs@4.4.0`. Dependency overrides are in place so `npm audit --omit=dev` returns zero production vulnerabilities.

## Rationale

GitHub's advisory for CVE-2023-30533 reports prototype pollution in npm `xlsx` when reading specially crafted files, with affected versions below `0.19.3` and no patched npm release. GitHub's advisory for CVE-2024-22363 reports ReDoS in SheetJS CE before `0.20.2`, also with no patched npm release.

Both issues matter to this application because Axiom Data Mapper reads user-supplied workbooks. Browser-side parsing reduces server exposure, but it can still affect availability and integrity in the user's browser session. If parsing were later moved server-side, the same vulnerable package would create a larger tenant-service risk.

## Current Implementation

Excel handling is isolated behind `lib/data-mapper/excel-import`. Validation is separately isolated behind `lib/data-mapper/validation`.

The current implementation supports `.xlsx` and `.xlsm` workbooks through ExcelJS. Legacy binary `.xls` files are rejected with a friendly message asking users to save the workbook as `.xlsx` or `.xlsm`.

The importer supports standard `.xlsx` and `.xlsm` workbooks that can be safely read by ExcelJS. Older or heavily modified customer spreadsheets may need to be opened in Excel and saved again as `.xlsx`. Legacy `.xls`, password-protected, encrypted, or structurally damaged workbooks are not supported in this version. A future repair or normalise workbook workflow can be considered if this becomes a frequent customer issue.

## Recommendation

Keep the ExcelJS approach. Do not reintroduce npm `xlsx` unless Axiom explicitly accepts the advisory risk or adopts a patched non-npm SheetJS distribution after a separate security review.

This decision should be reviewed periodically, especially if ExcelJS releases a maintained successor version or SheetJS resumes normal npm distribution.
