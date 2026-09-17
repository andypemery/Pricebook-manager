import type { UserRole } from "@prisma/client";
import { permissionKeys, permissionLabels, rolePresets } from "@/config/permissions.config";
import { SubmitButton } from "@/components/submit-button";

export type RoleTemplateSummary = {
  role: UserRole;
  permissions: unknown;
};

type RoleTemplateDefinition = {
  role: UserRole;
  label: string;
  description: string;
};

const editableRoles: readonly RoleTemplateDefinition[] = [
  { role: "VIEW_ONLY", label: "View Only", description: "Can view permitted information only." },
  { role: "SUPER_USER", label: "Super User", description: "Can manage operational records within permitted areas." },
  { role: "CUSTOMER_ADMIN", label: "Admin", description: "Can manage customer users and tenant settings within Axiom limits." }
];

function permissionMap(value: unknown, role: UserRole) {
  const defaults: Record<string, boolean> = {};
  for (const key of permissionKeys) defaults[key] = rolePresets[role].includes(key);
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...defaults, ...(value as Record<string, boolean>) };
  return defaults;
}

export function RoleTemplateGrid({ templates, updateAction }: {
  templates: readonly RoleTemplateSummary[];
  updateAction?: (formData: FormData) => void | Promise<void>;
}) {
  const customerPermissionKeys = permissionKeys.filter((key) => key !== "manageAxiomControls");

  return (
    <div className="roleTemplateGrid">
      {editableRoles.map((item) => {
        const template = templates.find((candidate) => candidate.role === item.role);
        const permissions = permissionMap(template?.permissions, item.role);
        const enabledPermissions = customerPermissionKeys.filter((key) => permissions[key]);
        return (
          <details className="roleTemplateCard" key={item.role}>
            <summary className="roleTemplateSummary">
              <span className="roleTemplateHeading">
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.role.replaceAll("_", " ")}</small>
                </span>
                <span className="badge">Locked identity</span>
              </span>
              <span className="muted">{item.description}</span>
              <span className="roleTemplatePermissionCount">{enabledPermissions.length} of {customerPermissionKeys.length} customer permissions enabled</span>
              <span className="roleTemplatePermissionPreview">
                {enabledPermissions.length > 0
                  ? enabledPermissions.slice(0, 3).map((key) => permissionLabels[key]).join(" · ")
                  : "No customer capabilities enabled"}
                {enabledPermissions.length > 3 ? ` · +${enabledPermissions.length - 3} more` : ""}
              </span>
              <span className="roleTemplateAction">Edit template</span>
            </summary>
            <form className="roleTemplateEditor" action={updateAction}>
              <input type="hidden" name="role" value={item.role} />
              <div className="checkboxGrid">
                {customerPermissionKeys.map((key) => (
                  <label className="checkboxLine" key={key}>
                    <input type="checkbox" name={key} defaultChecked={Boolean(permissions[key])} />
                    <span>{permissionLabels[key]}</span>
                  </label>
                ))}
              </div>
              <SubmitButton>Save {item.label} template</SubmitButton>
            </form>
          </details>
        );
      })}
    </div>
  );
}
