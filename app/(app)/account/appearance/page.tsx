export const dynamic = "force-dynamic";
import { requireUser } from "@/lib/auth";
import { updateAppearanceAction } from "@/lib/actions/admin.actions";
import { SubmitButton } from "@/components/submit-button";

export default async function AppearancePage() {
  const user = await requireUser();
  const selectedTheme = user.themePreference || "dark";
  return (
    <section className="card narrowCard">
      <p className="breadcrumb">Account / Appearance</p>
      <h1>Appearance</h1>
      <p className="muted">Choose how the app looks for your own account. This does not change other users.</p>
      <form className="appearanceForm" action={updateAppearanceAction as unknown as (formData: FormData) => void}>
        <fieldset className="themeOptions">
          <legend>Theme</legend>
          {[
            ["dark", "Dark", "Default Axiom dashboard style."],
            ["light", "Light", "Bright surfaces with the same Axiom accents."],
            ["system", "System", "Follow this device where supported."]
          ].map(([value, label, description]) => (
            <label key={value} className="themeOption">
              <input type="radio" name="theme" value={value} defaultChecked={selectedTheme === value} />
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <SubmitButton>Save appearance</SubmitButton>
      </form>
    </section>
  );
}
