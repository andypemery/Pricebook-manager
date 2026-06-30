"use client";

import { useActionState, useEffect, useRef } from "react";
import type { EmailProviderMode } from "@prisma/client";
import { disconnectEmailProviderAction, saveEmailSenderProfileAction, saveEmailSettingsAction, sendEmailSettingsTestAction } from "@/lib/actions/email.actions";
import { SubmitButton } from "@/components/submit-button";
import { axiomDefaults } from "@/config/axiom-defaults";

type Setting = {
  mode: EmailProviderMode;
  status: string;
  isEnabled: boolean;
  customerSendingDisabled: boolean;
  axiomFallbackEnabled: boolean;
  senderDisplayName: string;
  fromEmail: string;
  replyToEmail: string | null;
  graphSenderEmail: string | null;
  lastTestResult: string | null;
  lastSuccessfulSendAt: Date | null;
  lastFailedSendAt: Date | null;
  lastError: string | null;
} | null;

type Profile = {
  key: string;
  displayName: string;
  fromEmail: string;
  replyToEmail: string | null;
  isAxiomManaged: boolean;
  updatedAt: Date;
};

type ActionState = { success?: string; error?: string; clearForm?: boolean };

const sendingProfiles = [
  { key: "system_notifications", title: "System Notifications", description: "Invites, password resets, MFA codes, app alerts and standard notifications." },
  { key: "support_emails", title: "Support Emails", description: "Support ticket updates, support replies and customer support communication." },
  { key: "workflow_emails", title: "Workflow Emails", description: "Workflow notifications, approvals, reminders and task alerts." },
  { key: "user_sent_emails", title: "User-Sent Emails", description: "Manual emails sent by logged-in users where the app supports manual sending." }
];

async function saveReducer(_state: ActionState, formData: FormData): Promise<ActionState> {
  return saveEmailSettingsAction(formData);
}
async function testReducer(_state: ActionState, formData: FormData): Promise<ActionState> {
  return sendEmailSettingsTestAction(formData);
}
async function disconnectReducer(_state: ActionState): Promise<ActionState> {
  return disconnectEmailProviderAction();
}
async function profileReducer(_state: ActionState, formData: FormData): Promise<ActionState> {
  return saveEmailSenderProfileAction(formData);
}

function formatDate(value?: Date | null) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-GB");
}

function providerLabel(mode?: EmailProviderMode | null) {
  if (mode === "MICROSOFT_GRAPH") return "Microsoft 365";
  if (mode === "SMTP") return "Custom provider";
  return "Axiom Email Notifications";
}

export function EmailSettingsForm({ setting, profiles, axiomSenderConfigured }: { setting: Setting; profiles: Profile[]; axiomSenderConfigured: boolean }) {
  const initialState: ActionState = { success: "", error: "", clearForm: false };
  const [saveState, saveAction] = useActionState(saveReducer, initialState);
  const [testState, testAction] = useActionState(testReducer, initialState);
  const [disconnectState, disconnectAction] = useActionState(disconnectReducer, initialState);
  const [profileState, profileAction] = useActionState(profileReducer, initialState);
  const testFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (testState.clearForm) testFormRef.current?.reset();
  }, [testState.clearForm]);

  const mode = setting?.mode || "AXIOM";
  const profileByKey = new Map(profiles.map((profile) => [profile.key, profile]));
  const axiomStatus = axiomSenderConfigured ? "Active" : "Needs Axiom setup";

  return (
    <div className="stack">
      <section className="card">
        <h2>Current email status</h2>
        <div className="grid compactGrid">
          <div className="miniPanel"><span className="labelText">Default provider</span><strong>{providerLabel(mode)}</strong></div>
          <div className="miniPanel"><span className="labelText">Axiom Email Notifications</span><strong>{setting?.customerSendingDisabled ? "Fallback forced" : axiomStatus}</strong></div>
          <div className="miniPanel"><span className="labelText">Last successful send</span><strong>{formatDate(setting?.lastSuccessfulSendAt)}</strong></div>
          <div className="miniPanel"><span className="labelText">Last failed send</span><strong>{formatDate(setting?.lastFailedSendAt)}</strong></div>
        </div>
        {setting?.lastError ? <p className="warningBox">Last safe error: {setting.lastError}</p> : null}
      </section>

      <section className="grid">
        <div className="card">
          <h2>Axiom Email Notifications</h2>
          <p className="badge">{mode === "AXIOM" ? axiomStatus : "Safe fallback"}</p>
          <p className="muted">Used by default for invites, password resets, MFA codes, support updates, system notifications and workflow notifications. Customers do not need to connect a provider for Axiom Email Notifications.</p>
          {!axiomSenderConfigured ? <p className="warningBox">Axiom Email Notifications need Axiom deployment setup before real emails can be sent.</p> : null}
        </div>
        <div className="card">
          <h2>Microsoft 365</h2>
          <p className="badge">{mode === "MICROSOFT_GRAPH" ? setting?.status || "Configured" : "Not connected"}</p>
          <p className="muted">OAuth/Microsoft Graph connection flow is scaffolded. Microsoft 365 connection is not configured for this deployment yet.</p>
        </div>
        <div className="card">
          <h2>Gmail / Google Workspace</h2>
          <p className="badge">Not configured</p>
          <p className="muted">OAuth/Gmail API connection flow is scaffolded. Gmail connection is not configured for this deployment yet.</p>
        </div>
      </section>

      <form action={saveAction} className="card formCard">
        <h2>Default sending provider</h2>
        {saveState.success ? <p className="successBox">{saveState.success}</p> : null}
        {saveState.error ? <p className="warningBox">{saveState.error}</p> : null}
        <label className="field"><span>Provider mode</span><select name="mode" defaultValue={mode}><option value="AXIOM">Axiom Email Notifications</option><option value="MICROSOFT_GRAPH">Microsoft 365, where deployment connection is configured</option></select></label>
        <label className="field"><span>Sender display name</span><input name="senderDisplayName" defaultValue={setting?.senderDisplayName || axiomDefaults.email.displayName} /></label>
        <label className="field"><span>From address</span><input name="fromEmail" type="email" defaultValue={setting?.fromEmail || axiomDefaults.email.from} /></label>
        <label className="field"><span>Reply-to address</span><input name="replyToEmail" type="email" defaultValue={setting?.replyToEmail || axiomDefaults.email.replyTo} /></label>
        <label className="checkboxLine"><input name="axiomFallbackEnabled" type="checkbox" defaultChecked={setting?.axiomFallbackEnabled ?? true} /> Allow safe fallback to Axiom Email Notifications if a customer provider fails</label>
        <SubmitButton>Save provider settings</SubmitButton>
      </form>

      <section className="card">
        <h2>Sending profiles</h2>
        <p className="muted">Profiles are tenant-scoped and reusable. Shared mailbox and alias permissions are not verified automatically yet; use test email to confirm sending works.</p>
        {profileState.success ? <p className="successBox">{profileState.success}</p> : null}
        {profileState.error ? <p className="warningBox">{profileState.error}</p> : null}
        <div className="profileGrid">
          {sendingProfiles.map((item) => {
            const profile = profileByKey.get(item.key);
            return (
              <form action={profileAction} className="profileCard" key={item.key}>
                <input type="hidden" name="key" value={item.key} />
                <div className="sectionHeader"><h3>{item.title}</h3><span className="badge">{profile ? "Configured" : "Axiom default"}</span></div>
                <p className="muted">{item.description}</p>
                <label className="field"><span>Profile name</span><input name="displayName" defaultValue={profile?.displayName || item.title} /></label>
                <label className="field"><span>Provider</span><input value={providerLabel(mode)} readOnly /></label>
                <label className="field"><span>From address or shared mailbox</span><input name="fromEmail" type="email" defaultValue={profile?.fromEmail || setting?.fromEmail || axiomDefaults.email.from} /></label>
                <label className="field"><span>Reply-to address</span><input name="replyToEmail" type="email" defaultValue={profile?.replyToEmail || setting?.replyToEmail || ""} /></label>
                <p className="muted">Last updated: {formatDate(profile?.updatedAt)}</p>
                <SubmitButton>Save profile</SubmitButton>
              </form>
            );
          })}
        </div>
      </section>

      <section className="card formCard">
        <h2>Send test email</h2>
        {testState.success ? <p className="successBox">{testState.success}</p> : null}
        {testState.error ? <p className="warningBox">{testState.error}</p> : null}
        <form ref={testFormRef} action={testAction} className="inlineForm">
          <label className="field"><span>Test recipient email</span><input name="testRecipient" type="email" required /></label>
          <SubmitButton>Send test email</SubmitButton>
        </form>
        <p className="muted">Test attempts are logged without exposing secrets.</p>
      </section>

      <form action={disconnectAction} className="card formCard">
        <h2>Disconnect customer provider</h2>
        {disconnectState.success ? <p className="successBox">{disconnectState.success}</p> : null}
        {disconnectState.error ? <p className="warningBox">{disconnectState.error}</p> : null}
        <p className="muted">Disconnecting disables customer-managed sending. Axiom Email Notifications remain available where configured.</p>
        <SubmitButton>Disconnect provider</SubmitButton>
      </form>
    </div>
  );
}
