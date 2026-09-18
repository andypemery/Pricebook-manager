"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, Plus, Trash2 } from "lucide-react";
import {
  associateOutputProfileWithProjectAction,
  deleteOutputProfileAction,
  duplicateOutputProfileAction
} from "@/lib/actions/output-profile.actions";
import {
  approvePendingProfileContextChange,
  cancelPendingProfileContextChange,
  requestProfileContextChange,
  type ProfileContextIntent
} from "@/lib/data-mapper/output-profiles/draft-state";
import type { OutputProfileSummary } from "@/lib/data-mapper/output-profiles/types";

type Props = {
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
  projectId?: string;
  projectName?: string;
  isBusy: boolean;
  saveMessage: string | null;
  saveError: string | null;
  saveLabel: string;
  saveDisabled: boolean;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onSaveAsNew: (name: string) => void;
};

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
  projectId,
  projectName,
  isBusy,
  saveMessage,
  saveError,
  saveLabel,
  saveDisabled,
  onNameChange,
  onSave,
  onSaveAsNew
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [savingAsNew, setSavingAsNew] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [pendingIntent, setPendingIntent] = useState<ProfileContextIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const newProfileUrl = `/mapping?project=${encodeURIComponent(projectId ?? "")}&source=${encodeURIComponent(sourceWorkbookImportId)}&worksheet=${encodeURIComponent(sourceWorksheetId)}`;
  const selectedProfileId = activeProfileId ?? appliedProfileId;
  const confirmationOpen = pendingIntent !== null || confirmingDelete || savingAsNew;
  const usedProfiles = profiles.filter((profile) => profile.usedInProject);
  const otherProfiles = profiles.filter((profile) => !profile.usedInProject);

  function switchProfile(profileId: string) {
    if (!projectId || isPending || isBusy) return;
    setError(null);
    startTransition(async () => {
      const result = await associateOutputProfileWithProjectAction({ projectId, outputProfileId: profileId, sourceWorkbookImportId, sourceWorksheetId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`${newProfileUrl}&apply=${encodeURIComponent(profileId)}`);
      router.refresh();
    });
  }

  function duplicateProfile() {
    if (!selectedProfileId || isPending || isBusy) return;
    setError(null);
    startTransition(async () => {
      const result = await duplicateOutputProfileAction(selectedProfileId, projectId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(projectId ? `${newProfileUrl}&apply=${encodeURIComponent(result.profileId)}` : `/mapping?profile=${encodeURIComponent(result.profileId)}`);
      router.refresh();
    });
  }

  function performContextIntent(intent: ProfileContextIntent) {
    if (intent.type === "NEW") router.push(newProfileUrl);
    else if (intent.type === "SWITCH") switchProfile(intent.profileId);
    else duplicateProfile();
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

  function deleteProfile() {
    if (!activeProfileId || isPending || isBusy) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteOutputProfileAction(activeProfileId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(projectId ? newProfileUrl : "/mapping");
      router.refresh();
    });
  }

  const saveStatus = <div className="workspaceSaveStatus">
    {isDirty ? <span className="unsavedIndicator" role="status">Unsaved changes</span> : <span className="savedIndicator" role="status">{activeProfileId ? "Saved" : "Not yet saved"}</span>}
    {saveMessage ? <span className="success" role="status">{saveMessage}</span> : null}
    {saveError ? <span className="error" role="alert">{saveError}</span> : null}
  </div>;

  if (!projectId) {
    return <section className="card outputProfileManager masterProfileManager" aria-labelledby="profile-manager-title">
      <div className="workspaceHeaderTop">
        <label className="field profileNameField"><span id="profile-manager-title">Output Profile name</span><input value={currentProfileName} onChange={(event) => onNameChange(event.target.value)} maxLength={120} disabled={!canEdit || isBusy} /></label>
        <div className="workspaceSaveArea">{saveStatus}{canEdit ? <div className="actions"><button className="primary" type="button" onClick={onSave} disabled={saveDisabled}>{saveLabel}</button><button className="secondary" type="button" onClick={() => { setNewProfileName(""); setSavingAsNew(true); }} disabled={!activeProfileId || isPending || isBusy || confirmationOpen}>Save as new profile</button></div> : <span className="badge">Read-only access</span>}</div>
      </div>
      <div className="profileManagerActions masterProfileActions"><button className="dangerButton" type="button" onClick={() => setConfirmingDelete(true)} disabled={!canEdit || !activeProfileId || isPending || isBusy || confirmationOpen}><Trash2 aria-hidden="true" size={16} /> Delete</button><Link className="secondary" href="/mapping">Back to Output Profiles</Link></div>
      {savingAsNew ? <div className="discardConfirmation" role="dialog" aria-labelledby="save-as-new-title"><label className="field"><span id="save-as-new-title">New Output Profile name</span><input value={newProfileName} onChange={(event) => setNewProfileName(event.target.value)} maxLength={120} autoFocus /></label><p className="muted">The complete current working definition will be saved as a separate reusable master.</p><div className="actions"><button className="secondary" type="button" onClick={() => setSavingAsNew(false)} disabled={isBusy}>Cancel</button><button className="primary" type="button" onClick={() => { onSaveAsNew(newProfileName); setSavingAsNew(false); }} disabled={isBusy || !newProfileName.trim()}>Save as new profile</button></div></div> : null}
      {confirmingDelete ? <div className="deleteConfirmation" role="alert"><span>Delete <strong>{currentProfileName}</strong>? Its Project associations will be removed, but Projects, source workbooks and other profiles will not be changed.{isDirty ? " Your unsaved edits will also be discarded." : ""}</span><div className="actions"><button className="secondary" type="button" onClick={() => setConfirmingDelete(false)} disabled={isPending}>Cancel</button><button className="dangerButton" type="button" onClick={deleteProfile} disabled={isPending}>{isPending ? "Deleting" : "Delete profile"}</button></div></div> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
    </section>;
  }

  return <section className="card outputProfileManager" aria-labelledby="profile-manager-title">
    <div className="workspaceHeaderTop">
      <label className="field profileNameField"><span id="profile-manager-title">Output Profile name</span><input value={currentProfileName} onChange={(event) => onNameChange(event.target.value)} placeholder="For example, NHS Contract" maxLength={120} disabled={!canEdit || isBusy} /></label>
      <div className="workspaceSaveArea">{saveStatus}{canEdit ? <button className="primary" type="button" onClick={onSave} disabled={saveDisabled}>{saveLabel}</button> : <span className="badge">Read-only access</span>}</div>
    </div>
    <div className="workspaceContext" aria-label="Current Output Profile context"><div><span>Project</span><strong title={projectName}>{projectName}</strong></div><div><span>Source workbook</span><strong title={sourceFilename}>{sourceFilename}</strong></div><div><span>Reference worksheet</span><strong title={sourceWorksheetName}>{sourceWorksheetName}</strong></div><div><span>Profile status</span><strong>{activeProfileId ? "Reusable saved profile" : appliedProfileId ? "Applied profile draft" : "New profile draft"}</strong></div></div>
    <div className="profileManagerControls">
      <label className="field profileSelector"><span>Output Profile</span><select value={selectedProfileId ?? ""} disabled={confirmationOpen || isBusy || isPending} onChange={(event) => { if (event.target.value) requestContextIntent({ type: "SWITCH", profileId: event.target.value }); }}>
        {!selectedProfileId ? <option value="">New unsaved profile</option> : null}
        {selectedProfileId && !profiles.some((profile) => profile.id === selectedProfileId) ? <option value={selectedProfileId}>{currentProfileName}</option> : null}
        {usedProfiles.length > 0 ? <optgroup label="Used in this Project">{usedProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.outputFormat}</option>)}</optgroup> : null}
        {otherProfiles.length > 0 ? <optgroup label="Other reusable profiles">{otherProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.outputFormat}</option>)}</optgroup> : null}
      </select></label>
      <div className="profileManagerActions"><button className="secondary" type="button" onClick={() => requestContextIntent({ type: "NEW" })} disabled={!canEdit || isPending || isBusy || confirmationOpen}><Plus aria-hidden="true" size={16} /> New Output Profile</button><button className="secondary" type="button" onClick={() => requestContextIntent({ type: "DUPLICATE" })} disabled={!canEdit || !selectedProfileId || isPending || isBusy || confirmationOpen}><Copy aria-hidden="true" size={16} /> Duplicate</button><button className="dangerButton" type="button" onClick={() => setConfirmingDelete(true)} disabled={!canEdit || !activeProfileId || isPending || isBusy || confirmationOpen}><Trash2 aria-hidden="true" size={16} /> Delete</button><Link className="secondary" href={`/projects/${projectId}`}>Project</Link><Link className="secondary" href={`/projects/${projectId}/workbook`}>Workbook</Link><Link className="secondary" href="/dashboard">Dashboard</Link></div>
    </div>
    {pendingIntent ? <div className="discardConfirmation" role="alert"><span>You have unsaved changes. Discard them and {pendingIntent.type === "NEW" ? "create a new profile" : pendingIntent.type === "DUPLICATE" ? "duplicate the last saved profile" : "switch profiles"}?</span><div className="actions"><button className="secondary" type="button" onClick={() => setPendingIntent(cancelPendingProfileContextChange().pendingIntent)}>Stay here</button><button className="dangerButton" type="button" onClick={discardAndContinue}>Discard changes and continue</button></div></div> : null}
    {confirmingDelete ? <div className="deleteConfirmation" role="alert"><span>Delete <strong>{currentProfileName}</strong>? Its Project associations will be removed, but Projects, source workbooks and other profiles will not be changed.{isDirty ? " Your unsaved edits will also be discarded." : ""}</span><div className="actions"><button className="secondary" type="button" onClick={() => setConfirmingDelete(false)} disabled={isPending}>Cancel</button><button className="dangerButton" type="button" onClick={deleteProfile} disabled={isPending}>{isPending ? "Deleting" : "Delete profile"}</button></div></div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </section>;
}
