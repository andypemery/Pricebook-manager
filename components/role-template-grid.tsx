import type { UserRole } from "@prisma/client";
import { permissionKeys, permissionLabels, rolePresets } from "@/config/permissions.config";
import { SubmitButton } from "@/components/submit-button";

export type RoleTemplateSummary = {
  role: UserRole;
  permissions: unknown;
};

type RoleTemplateDefinition = { role: UserRole; label: string };

const editableRoles: readonly RoleTemplateDefinition[] = [
  { role: "VIEW_ONLY", label: "View Only" },
  { role: "SUPER_USER", label: "Super User" },
  { role: "CUSTOMER_ADMIN", label: "Admin" }
];

function permissionMap(value: unknown, role: UserRole) {
  const defaults: Record<string, boolean> = {};
  for (const key of permissionKeys) defaults[key] = rolePresets[role].includes(key);
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...defaults, ...(value as Record<string, boolean>) }
    : defaults;
}

export function RoleTemplateGrid({ templates, updateAction }: {
  templates: readonly RoleTemplateSummary[];
  updateAction?: (formData: FormData) => void | Promise<void>;
}) {
  const customerPermissionKeys = permissionKeys.filter((key) => key !== "manageAxiomControls");

  return (
    <form className="roleTemplateMatrix" action={updateAction}>
      <p className="muted">Role names are locked. Changes apply to future users created or imported with that role; existing users keep their current permission snapshot and individual overrides.</p>
      <div className="roleTemplateMatrixScroll" tabIndex={0} aria-label="Role template permissions matrix">
        <table>
          <thead><tr><th scope="col">Permission</th>{editableRoles.map((role) => <th scope="col" key={role.role}>{role.label}</th>)}</tr></thead>
          <tbody>{customerPermissionKeys.map((permission) => <tr key={permission}>
            <th scope="row">{permissionLabels[permission]}</th>
            {editableRoles.map((role) => {
              const template = templates.find((candidate) => candidate.role === role.role);
              const permissions = permissionMap(template?.permissions, role.role);
              const id = `${role.role}-${permission}`;
              return <td key={role.role}><input id={id} type="checkbox" name={`permission:${role.role}:${permission}`} defaultChecked={Boolean(permissions[permission])} aria-label={`${permissionLabels[permission]} for ${role.label}`} /><label className="visuallyHidden" htmlFor={id}>{permissionLabels[permission]} for {role.label}</label></td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <SubmitButton>Save role templates</SubmitButton>
    </form>
  );
}
