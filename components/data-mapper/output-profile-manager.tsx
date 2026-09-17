"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteOutputProfileAction, duplicateOutputProfileAction } from "@/lib/actions/output-profile.actions";
import {
  approvePendingProfileContextChange,
  cancelPendingProfileContextChange,
  requestProfileContextChange,
  type ProfileContextIntent
} from "@/lib/data-mapper/output-profiles/draft-state";
import type { OutputProfileSummary } from "@/lib/data-mapper/output-profiles/types";

export function OutputProfileManager({
  profiles,
  activeProfileId,
  appliedProfileId,
  sourceWorkbookImportId,
  sourceWorksheetId,
  sourceFilename,
  sourceWorksheetName,
  currentProfileName,
  isDirty,
  canEdit,
  isBusy,
  saveMessage,
  saveError,
  saveLabel,
  saveDisabled,
  onNameChange,
  onSave
}: {
  profiles: OutputProfileSummary[];
  activeProfileId: string | null;
  appliedProfileId: string | null;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  sourceFilename: string;
  sourceWorksheetName: string;
  currentProfileName: string;
  isDirty: boolean;
  canEdit: boolean;
  isBusy: boolean;
  saveMessage: string | null;
  saveError: string | null;
  saveLabel: string;
  saveDisabled: boolean;
  onNameChange: (name: string) => void;
  onSave: () => void;
}) {
  const router = useRouter();
  const profileNameInput = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<ProfileContextIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileToApply, setProfileToApply] = useState(appliedProfileId ?? profiles[0]?.id ?? "");
  const newProfileUrl = `/mapping?source=${encodeURIComponent(sourceWorkbookImportId)}&worksheet=${encodeURIComponent(sourceWorksheetId)}`;
  const selectedReusableProfile = profiles.find((profile) => profile.id === profileToApply) ?? null;
  const profilesFromCurrentSource = profiles.filter((profile) => profile.sourceWorkbookImportId === sourceWorkbookImportId && profile.sourceWorksheetId === sourceWorksheetId);
  const applyProfileUrl = selectedReusableProfile
    ? `${newProfileUrl}&apply=${encodeURIComponent(selectedReusableProfile.id)}`
    : null;
  const confirmationOpen = pendingIntent !== null || confirmingDelete;

  function duplicateProfile() {
    if (!activeProfileId || isPending || isBusy) return;
    setError(null);
    startTransition(async () => {
      const result = await duplicateOutputProfileAction(activeProfileId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/mapping?profile=${encodeURIComponent(result.profileId)}`);
      router.refresh();
    });
  }

  function performContextIntent(intent: ProfileContextIntent) {
    if (intent.type === "NEW") {
      router.push(newProfileUrl);
      return;
    }
    if (intent.type === "SWITCH") {
      router.push(`/mapping?profile=${encodeURIComponent(intent.profileId)}`);
      return;
    }
    duplicateProfile();
  }

  function requestContextIntent(intent: ProfileContextIntent) {
    setConfirmingDelete(false);
    const decision = requestProfileContextChange(isDirty, intent);
    setPendingIntent(decision.pendingIntent);
    if (decision.approvedIntent) performContextIntent(decision.approvedIntent);
  }

  function discardAndContinue() {
    const decision = approvePendingProfileContextChange(pendingIntent);
    setPendingIntent(decision.pendingIntent);
    if (decision.approvedIntent) performContextIntent(decision.approvedIntent);
  }

  function stayHere() {
    const decision = cancelPendingProfileContextChange();
    setPendingIntent(decision.pendingIntent);
  }

  function deleteProfile() {
    if (!activeProfileId || isPending || isBusy) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteOutputProfileAction(activeProfileId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const nextProfile = profiles.find((profile) => profile.id !== activeProfileId);
      router.replace(nextProfile ? `/mapping?profile=${encodeURIComponent(nextProfile.id)}` : newProfileUrl);
      router.refresh();
    });
  }

  return (
    <section className="card outputProfileManager" aria-labelledby="profile-manager-title">
      <div className="workspaceHeaderTop">
        <label className="field profileNameField">
          <span id="profile-manager-title">Output Profile name</span>
          <input ref={profileNameInput} value={currentProfileName} onChange={(event) => onNameChange(event.target.value)} placeholder="For example, NHS Contract" maxLength={120} disabled={!canEdit || isBusy} />
        </label>
        <div className="workspaceSaveArea">
          <div className="workspaceSaveStatus">
            {isDirty ? <span className="unsavedIndicator" role="status">Unsaved changes</span> : <span className="savedIndicator" role="status">{activeProfileId ? "Saved" : "Not yet saved"}</span>}
            {saveMessage ? <span className="success" role="status">{saveMessage}</span> : null}
            {saveError ? <span className="error" role="alert">{saveError}</span> : null}
          </div>
          {canEdit ? <button className="primary" type="button" onClick={onSave} disabled={saveDisabled}>{saveLabel}</button> : <span className="badge">Read-only access</span>}
        </div>
      </div>
      <div className="workspaceContext" aria-label="Current Output Profile context">
        <div><span>Source workbook</span><strong title={sourceFilename}>{sourceFilename}</strong></div>
        <div><span>Reference worksheet</span><strong title={sourceWorksheetName}>{sourceWorksheetName}</strong></div>
        <div><span>Profile status</span><strong>{activeProfileId ? "Reusable saved profile" : appliedProfileId ? "Applied profile draft" : "New profile draft"}</strong></div>
      </div>
      <div className="profileManagerControls">
        <label className="field profileSelector">
          <span>Currently editing</span>
          <select value={activeProfileId ?? ""} disabled={confirmationOpen || isBusy} onChange={(event) => {
            const profileId = event.target.value;
            if (profileId) requestContextIntent({ type: "SWITCH", profileId });
          }}>
            {!activeProfileId ? <option value="">{appliedProfileId ? `Using ${currentProfileName}` : "New unsaved profile"}</option> : null}
            {profilesFromCurrentSource.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.outputFormat}</option>)}
          </select>
        </label>
        <div className="profileManagerActions">
          <button className="secondary" type="button" onClick={() => requestContextIntent({ type: "NEW" })} disabled={!canEdit || !activeProfileId || isPending || isBusy || confirmationOpen}>
            <Plus aria-hidden="true" size={16} /> New Output Profile
          </button>
          <button className="secondary" type="button" onClick={() => requestContextIntent({ type: "DUPLICATE" })} disabled={!canEdit || !activeProfileId || isPending || isBusy || confirmationOpen}>
            <Copy aria-hidden="true" size={16} /> Duplicate
          </button>
          <button className="secondary" type="button" onClick={() => { profileNameInput.current?.focus(); profileNameInput.current?.select(); }} disabled={!canEdit || isPending || isBusy || confirmationOpen}>
            <Pencil aria-hidden="true" size={16} /> Rename
          </button>
          <button className="dangerButton" type="button" onClick={() => setConfirmingDelete(true)} disabled={!canEdit || !activeProfileId || isPending || isBusy || confirmationOpen}>
            <Trash2 aria-hidden="true" size={16} /> Delete
          </button>
          <Link className="secondary" href="/dashboard">Dashboard</Link>
          <Link className="secondary" href="/workbook">Workbook Explorer</Link>
        </div>
      </div>
      <div className="applySavedProfile">
        <label className="field">
          <span>Apply saved profile to this worksheet</span>
          <select value={profileToApply} onChange={(event) => setProfileToApply(event.target.value)} disabled={profiles.length === 0 || confirmationOpen || isBusy}>
            {profiles.length === 0 ? <option value="">No saved profiles available</option> : null}
            {profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.outputFormat} · {profile.outputColumnCount} columns</option>)}
          </select>
        </label>
        {selectedReusableProfile ? (
          <div className="applySavedProfileDetails">
            <span>Originally created from {selectedReusableProfile.originWorkbookFileName} · {selectedReusableProfile.originWorksheetName}</span>
            <strong>{selectedReusableProfile.outputFormat} · {selectedReusableProfile.outputColumnCount} output columns</strong>
          </div>
        ) : null}
        {applyProfileUrl ? <Link className="primary" href={applyProfileUrl}>Apply saved profile</Link> : <button className="primary" type="button" disabled>Apply saved profile</button>}
      </div>
      {pendingIntent ? (
        <div className="discardConfirmation" role="alert">
          <span>You have unsaved changes. Discard them and {pendingIntent.type === "NEW" ? "create a new profile" : pendingIntent.type === "DUPLICATE" ? "duplicate the last saved profile" : "switch profiles"}?</span>
          <div className="actions">
            <button className="secondary" type="button" onClick={stayHere}>Stay here</button>
            <button className="dangerButton" type="button" onClick={discardAndContinue}>Discard changes and continue</button>
          </div>
        </div>
      ) : null}
      {confirmingDelete ? (
        <div className="deleteConfirmation" role="alert">
          <span>Delete <strong>{currentProfileName}</strong>? Its source workbook and other profiles will not be changed.{isDirty ? " Your unsaved edits will also be discarded." : ""}</span>
          <div className="actions">
            <button className="secondary" type="button" onClick={() => setConfirmingDelete(false)} disabled={isPending}>Cancel</button>
            <button className="dangerButton" type="button" onClick={deleteProfile} disabled={isPending}>{isPending ? "Deleting" : "Delete profile"}</button>
          </div>
        </div>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>
  );
}
