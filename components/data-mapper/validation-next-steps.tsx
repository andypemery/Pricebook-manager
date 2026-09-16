import { Columns3, Upload } from "lucide-react";

export function ValidationNextSteps({
  errorCount,
  warningCount,
  canContinue,
  isPreparing,
  uploadProgress,
  onUploadCorrected,
  onContinue
}: {
  errorCount: number;
  warningCount: number;
  canContinue: boolean;
  isPreparing: boolean;
  uploadProgress?: number | null;
  onUploadCorrected: () => void;
  onContinue: () => void;
}) {
  return (
    <section className="card validationNextSteps" aria-labelledby="validation-next-step-title">
      <div>
        <p className="sheetLabel">Next step</p>
        <h2 id="validation-next-step-title">Review issues, then continue your Output Profile</h2>
        {errorCount > 0 ? (
          <p className="validationErrorGuidance" role="alert">
            Errors were found in the source workbook. Correct these values in the source file and upload the corrected workbook.
          </p>
        ) : null}
        {warningCount > 0 ? (
          <p className="validationWarningGuidance">
            Warnings highlight values to review. They do not block Output Profile design.
          </p>
        ) : null}
        <p className="muted">
          You can continue setting up the Output Profile now. Blocking source errors must be resolved before the future final processing and output workflow.
        </p>
      </div>
      <div className="actions validationNextStepActions">
        <button className="secondary prominentSecondary" type="button" onClick={onUploadCorrected}>
          <Upload aria-hidden="true" size={18} /> Upload corrected workbook
        </button>
        {canContinue ? (
          <button className="primary" type="button" onClick={onContinue} disabled={isPreparing}>
            <Columns3 aria-hidden="true" size={18} /> {isPreparing ? `Uploading… ${uploadProgress ?? 0}%` : "Continue to Output Profile"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
