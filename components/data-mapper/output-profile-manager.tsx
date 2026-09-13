"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteOutputProfileAction, duplicateOutputProfileAction } from "@/lib/actions/output-profile.actions";
import type { OutputProfileSummary } from "@/lib/data-mapper/output-profiles/types";

export function OutputProfileManager({
  profiles,
  activeProfileId,
  sourceWorkbookImportId,
  sourceWorksheetId,
  currentProfileName,
  canEdit,
  onRename
}: {
  profiles: OutputProfileSummary[];
  activeProfileId: string | null;
  sourceWorkbookImportId: string;
  sourceWorksheetId: string;
  currentProfileName: string;
  canEdit: boolean;
  onRename: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newProfileUrl = `/mapping?source=${encodeURIComponent(sourceWorkbookImportId)}&worksheet=${encodeURIComponent(sourceWorksheetId)}`;

  function duplicateProfile() {
    if (!activeProfileId || isPending) return;
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

  function deleteProfile() {
    if (!activeProfileId || isPending) return;
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
          <p className="sheetLabel">Profiles for this source</p>
          <h2 id="profile-manager-title">{currentProfileName.trim() || "New Output Profile"}</h2>
        </div>
        <span className="badge">{profiles.length} saved</span>
      </div>
      <div className="profileManagerControls">
        <label className="field profileSelector">
          <span>Currently editing</span>
          <select value={activeProfileId ?? ""} onChange={(event) => {
            const profileId = event.target.value;
            router.push(profileId ? `/mapping?profile=${encodeURIComponent(profileId)}` : newProfileUrl);
          }}>
            {!activeProfileId ? <option value="">New unsaved profile</option> : null}
            {profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.outputFormat}</option>)}
          </select>
        </label>
        <div className="profileManagerActions">
          <button className="secondary" type="button" onClick={() => router.push(newProfileUrl)} disabled={!canEdit || !activeProfileId || isPending}>
            <Plus aria-hidden="true" size={16} /> New Output Profile
          </button>
          <button className="secondary" type="button" onClick={duplicateProfile} disabled={!canEdit || !activeProfileId || isPending}>
            <Copy aria-hidden="true" size={16} /> Duplicate Profile
          </button>
          <button className="secondary" type="button" onClick={onRename} disabled={!canEdit || isPending}>
            <Pencil aria-hidden="true" size={16} /> Rename Profile
          </button>
          <button className="dangerButton" type="button" onClick={() => setConfirmingDelete(true)} disabled={!canEdit || !activeProfileId || isPending}>
            <Trash2 aria-hidden="true" size={16} /> Delete Profile
          </button>
        </div>
      </div>
      {confirmingDelete ? (
        <div className="deleteConfirmation" role="alert">
          <span>Delete <strong>{currentProfileName}</strong>? Its source workbook and other profiles will not be changed.</span>
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
