"use client";

import { useState, useTransition } from "react";
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
  currentProfileName,
  isDirty,
  canEdit,
  isBusy,
  onRename
}: {
  profiles: OutputProfileSummary[];
  activeProfileId: string | null;
  appliedProfileId: string | null;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  currentProfileName: string;
  isDirty: boolean;
  canEdit: boolean;
  isBusy: boolean;
  onRename: () => void;
}) {
  const router = useRouter();
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
      <div className="sectionHeader">
        <div>
          <p className="sheetLabel">Current profile</p>
          <h2 id="profile-manager-title">{currentProfileName.trim() || "New Output Profile"}</h2>
        </div>
        <span className="badge">{profiles.length} reusable saved</span>
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
            <Copy aria-hidden="true" size={16} /> Duplicate Profile
          </button>
          <button className="secondary" type="button" onClick={onRename} disabled={!canEdit || isPending || isBusy || confirmationOpen}>
            <Pencil aria-hidden="true" size={16} /> Rename Profile
          </button>
          <button className="dangerButton" type="button" onClick={() => setConfirmingDelete(true)} disabled={!canEdit || !activeProfileId || isPending || isBusy || confirmationOpen}>
            <Trash2 aria-hidden="true" size={16} /> Delete Profile
          </button>
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
